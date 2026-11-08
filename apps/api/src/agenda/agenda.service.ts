import { DailyAppointmentsDto } from './daily-appointments.dto.js';
import { VitalSignsDto } from './vital-signs.dto.js';
import { NursingQueueDto } from './nursing-queue.dto.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityDto } from './availability.dto.js';
import { CreateAppointmentDto } from './create-appointment.dto.js';

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog(actorId: number, ip?: string) {
    await this.audit.record(
      actorId,
      'READ_AGENDA_CATALOG',
      'agenda/catalog',
      ip,
    );
    const eligible = {
      usuario: { activo: true, rol: 'medico' as const },
      horarios: { some: { consultorio: { activo: true } } },
    };
    const specialties = await this.prisma.especialidad.findMany({
      where: { medicos: { some: eligible } },
      select: {
        id: true,
        nombre: true,
        medicos: {
          where: eligible,
          select: {
            id: true,
            usuario: { select: { nombres: true, apellidos: true } },
          },
          orderBy: [{ usuario: { apellidos: 'asc' } }, { id: 'asc' }],
        },
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    return {
      especialidades: specialties.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        medicos: s.medicos.map((m) => ({ id: m.id, ...m.usuario })),
      })),
    };
  }

  async create(dto: CreateAppointmentDto, actorId: number, ip?: string) {
    const start = new Date(dto.inicio);
    // Shift the instant to Lima wall-clock components, independent of server TZ.
    const local = new Date(start.getTime() - 5 * 3600000);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const weekday = local.getUTCDay() || 7;
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize reservations for a doctor across API processes. Under READ
        // COMMITTED, the overlap query sees the preceding reservation's commit.
        await tx.$queryRaw`SELECT id FROM medico WHERE id = ${dto.medicoId} FOR UPDATE`;
        if (start.getTime() <= Date.now()) {
          throw new BadRequestException('Appointment must start in the future');
        }
        const doctor = await tx.medico.findFirst({
          where: { id: dto.medicoId, usuario: { activo: true, rol: 'medico' } },
          select: { id: true },
        });
        if (!doctor) throw new NotFoundException('Active doctor not found');
        const patient = await tx.paciente.findUnique({
          where: { id: dto.pacienteId },
          select: { id: true },
        });
        if (!patient) throw new NotFoundException('Patient not found');
        const schedules = await tx.horarioMedico.findMany({
          where: {
            medicoId: dto.medicoId,
            diaSemana: weekday,
            consultorio: { activo: true },
          },
          select: { horaInicio: true, horaFin: true, duracionCitaMin: true },
        });
        const schedule = schedules.find((s) => {
          const begin =
            s.horaInicio.getUTCHours() * 60 + s.horaInicio.getUTCMinutes();
          const end = s.horaFin.getUTCHours() * 60 + s.horaFin.getUTCMinutes();
          return (
            minute >= begin &&
            minute + s.duracionCitaMin <= end &&
            (minute - begin) % s.duracionCitaMin === 0
          );
        });
        if (!schedule)
          throw new BadRequestException(
            'Start does not match a complete scheduled slot',
          );
        const end = new Date(
          start.getTime() + schedule.duracionCitaMin * 60000,
        );
        const overlap = await tx.cita.findFirst({
          where: {
            medicoId: dto.medicoId,
            estado: { not: 'cancelada' },
            fechaHoraInicio: { lt: end },
            fechaHoraFin: { gt: start },
          },
          select: { id: true },
        });
        if (overlap)
          throw new ConflictException(
            'Appointment slot is no longer available',
          );
        const appointment = await tx.cita.create({
          data: {
            pacienteId: dto.pacienteId,
            medicoId: dto.medicoId,
            fechaHoraInicio: start,
            fechaHoraFin: end,
            motivo: dto.motivo,
            canalOrigen: dto.canalOrigen,
            modalidad: 'presencial',
            creadoPor: actorId,
          },
          select: {
            id: true,
            pacienteId: true,
            medicoId: true,
            fechaHoraInicio: true,
            fechaHoraFin: true,
            estado: true,
            canalOrigen: true,
            modalidad: true,
          },
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'CREATE_CITA',
            recurso: `agenda/appointments/${appointment.id}`,
            ipOrigen: ip,
          },
        });
        return appointment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async registerArrival(id: number, actorId: number, ip?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize arrival requests so retries preserve the original timestamp
        // and produce only one arrival audit entry across API processes.
        await tx.$queryRaw`SELECT id FROM cita WHERE id = ${id} FOR UPDATE`;
        const appointment = await tx.cita.findUnique({
          where: { id },
          select: {
            id: true,
            fechaHoraInicio: true,
            estado: true,
            modalidad: true,
            llegadaEn: true,
          },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');
        const now = new Date(Date.now());
        const limaDate = (instant: Date) =>
          new Date(instant.getTime() - 5 * 3600000).toISOString().slice(0, 10);
        if (limaDate(appointment.fechaHoraInicio) !== limaDate(now)) {
          throw new BadRequestException(
            'Arrival requires an appointment for today in America/Lima',
          );
        }
        if (
          appointment.modalidad !== 'presencial' ||
          !['programada', 'confirmada', 'reprogramada'].includes(
            appointment.estado,
          )
        ) {
          throw new ConflictException(
            'Appointment is not eligible for arrival',
          );
        }
        if (appointment.llegadaEn) {
          return {
            id: appointment.id,
            estado: appointment.estado,
            llegadaEn: appointment.llegadaEn,
          };
        }
        const result = await tx.cita.update({
          where: { id },
          data: { llegadaEn: now },
          select: { id: true, estado: true, llegadaEn: true },
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'REGISTER_ARRIVAL',
            recurso: `agenda/appointments/${id}`,
            ipOrigen: ip,
          },
        });
        return result;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async recordVitalSigns(
    id: number,
    dto: VitalSignsDto,
    actorId: number,
    ip?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM cita WHERE id = ${id} FOR UPDATE`;
        const appointment = await tx.cita.findUnique({
          where: { id },
          select: {
            id: true,
            fechaHoraInicio: true,
            estado: true,
            modalidad: true,
            llegadaEn: true,
            preparacionCompletadaEn: true,
            evaluacionPrevia: { select: { id: true } },
          },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');
        const now = new Date(Date.now());
        const limaDate = (date: Date) =>
          new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10);
        if (limaDate(appointment.fechaHoraInicio) !== limaDate(now)) {
          throw new BadRequestException(
            'Preparation requires an appointment for today in America/Lima',
          );
        }
        if (
          appointment.modalidad !== 'presencial' ||
          !['programada', 'confirmada', 'reprogramada'].includes(
            appointment.estado,
          ) ||
          !appointment.llegadaEn ||
          appointment.llegadaEn > now ||
          appointment.preparacionCompletadaEn ||
          appointment.evaluacionPrevia
        ) {
          throw new ConflictException(
            'Patient must have arrived and be waiting for preparation',
          );
        }
        const evaluation = await tx.evaluacionPrevia.create({
          data: {
            citaId: id,
            registradoPor: actorId,
            registradoEn: now,
            temperaturaC: dto.temperaturaC,
            presionSistolica: dto.presionSistolica,
            presionDiastolica: dto.presionDiastolica,
            frecuenciaCardiaca: dto.frecuenciaCardiaca,
            frecuenciaRespiratoria: dto.frecuenciaRespiratoria,
            saturacionOxigeno: dto.saturacionOxigeno,
            pesoKg: dto.pesoKg,
            tallaCm: dto.tallaCm,
            observaciones: dto.observaciones,
          },
        });
        await tx.cita.update({
          where: { id },
          data: { preparacionCompletadaEn: now },
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'CREATE_VITAL_SIGNS',
            recurso: `agenda/appointments/${id}/vital-signs`,
            ipOrigen: ip,
          },
        });
        return evaluation;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async readVitalSigns(id: number, actorId: number, ip?: string) {
    await this.audit.record(
      actorId,
      'READ_VITAL_SIGNS',
      `agenda/appointments/${id}/vital-signs`,
      ip,
    );
    const appointment = await this.prisma.cita.findFirst({
      where: { id, medico: { usuarioId: actorId } },
      select: {
        evaluacionPrevia: {
          include: {
            autor: { select: { id: true, nombres: true, apellidos: true } },
          },
        },
      },
    });
    if (!appointment?.evaluacionPrevia)
      throw new NotFoundException(
        'Evaluation not found for the assigned doctor',
      );
    return appointment.evaluacionPrevia;
  }

  async dailyAppointments(
    query: DailyAppointmentsDto,
    actorId: number,
    ip?: string,
  ) {
    const fecha = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${fecha}T00:00:00-05:00`);
    await this.audit.record(
      actorId,
      'READ_DAILY_APPOINTMENTS',
      'agenda/appointments',
      ip,
    );
    const rows = await this.prisma.cita.findMany({
      where: {
        fechaHoraInicio: {
          gte: start,
          lt: new Date(start.getTime() + 86400000),
        },
        medicoId: query.medicoId,
        estado: query.estado,
      },
      select: {
        id: true,
        fechaHoraInicio: true,
        fechaHoraFin: true,
        estado: true,
        modalidad: true,
        llegadaEn: true,
        paciente: {
          select: {
            id: true,
            tipoDocumento: true,
            numeroDocumento: true,
            nombres: true,
            apellidos: true,
          },
        },
        medico: {
          select: {
            id: true,
            usuario: { select: { nombres: true, apellidos: true } },
            especialidad: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: [{ fechaHoraInicio: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      fecha,
      zonaHoraria: 'America/Lima',
      pagina: query.pagina,
      limite: query.limite,
      hayMas: rows.length > query.limite,
      citas: rows.slice(0, query.limite).map((row) => ({
        id: row.id,
        inicio: row.fechaHoraInicio,
        fin: row.fechaHoraFin,
        estado: row.estado,
        modalidad: row.modalidad,
        llegadaEn: row.llegadaEn,
        paciente: row.paciente,
        medico: { id: row.medico.id, ...row.medico.usuario },
        especialidad: row.medico.especialidad,
      })),
    };
  }

  async nursingQueue(query: NursingQueueDto, actorId: number, ip?: string) {
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const dayStart = new Date(`${today}T00:00:00-05:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    await this.audit.record(
      actorId,
      'READ_NURSING_QUEUE',
      'agenda/nursing-queue',
      ip,
    );
    const appointments = await this.prisma.cita.findMany({
      where: {
        fechaHoraInicio: { gte: dayStart, lt: dayEnd },
        llegadaEn: { not: null },
        preparacionCompletadaEn: null,
        modalidad: 'presencial',
        estado: { in: ['programada', 'confirmada', 'reprogramada'] },
      },
      select: {
        id: true,
        fechaHoraInicio: true,
        llegadaEn: true,
        paciente: {
          select: {
            id: true,
            tipoDocumento: true,
            numeroDocumento: true,
            nombres: true,
            apellidos: true,
            fechaNacimiento: true,
          },
        },
        medico: {
          select: {
            id: true,
            usuario: { select: { nombres: true, apellidos: true } },
            especialidad: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: [{ llegadaEn: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      fecha: today,
      zonaHoraria: 'America/Lima',
      pagina: query.pagina,
      limite: query.limite,
      hayMas: appointments.length > query.limite,
      pacientes: appointments.slice(0, query.limite).map((appointment) => {
        const birth = appointment.paciente.fechaNacimiento
          .toISOString()
          .slice(0, 10);
        const age =
          Number(today.slice(0, 4)) -
          Number(birth.slice(0, 4)) -
          (today.slice(5) < birth.slice(5) ? 1 : 0);
        return {
          citaId: appointment.id,
          paciente: {
            id: appointment.paciente.id,
            tipoDocumento: appointment.paciente.tipoDocumento,
            numeroDocumento: appointment.paciente.numeroDocumento,
            nombres: appointment.paciente.nombres,
            apellidos: appointment.paciente.apellidos,
            edad: age,
          },
          inicio: appointment.fechaHoraInicio,
          llegadaEn: appointment.llegadaEn,
          medico: { id: appointment.medico.id, ...appointment.medico.usuario },
          especialidad: appointment.medico.especialidad,
          estadoPreparacion: 'pendiente',
        };
      }),
    };
  }

  async availability(dto: AvailabilityDto, actorId: number, ip?: string) {
    // Lima uses UTC-05:00 year-round. Weekly TIME values are wall-clock times,
    // represented by Prisma with a UTC reference date; never use server-local getters.
    const dayStart = new Date(`${dto.fecha}T00:00:00-05:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const weekday = new Date(`${dto.fecha}T12:00:00Z`).getUTCDay() || 7;
    const now = Date.now();
    await this.audit.record(
      actorId,
      'READ_AVAILABILITY',
      'agenda/availability',
      ip,
    );

    const schedules = await this.prisma.horarioMedico.findMany({
      where: {
        diaSemana: weekday,
        medicoId: dto.medicoId,
        medico: {
          especialidadId: dto.especialidadId,
          usuario: { activo: true, rol: 'medico' },
        },
        consultorio: { activo: true },
      },
      select: {
        medicoId: true,
        consultorioId: true,
        horaInicio: true,
        horaFin: true,
        duracionCitaMin: true,
        medico: {
          select: { usuario: { select: { nombres: true, apellidos: true } } },
        },
        consultorio: { select: { nombre: true } },
      },
      orderBy: [{ medicoId: 'asc' }, { horaInicio: 'asc' }],
    });
    const appointments = schedules.length
      ? await this.prisma.cita.findMany({
          where: {
            medicoId: { in: [...new Set(schedules.map((s) => s.medicoId))] },
            estado: { not: 'cancelada' },
            fechaHoraInicio: { lt: dayEnd },
            fechaHoraFin: { gt: dayStart },
          },
          select: { medicoId: true, fechaHoraInicio: true, fechaHoraFin: true },
        })
      : [];

    const turnos = schedules.flatMap((schedule) => {
      const minutes = (time: Date) =>
        time.getUTCHours() * 60 + time.getUTCMinutes();
      const endMinute = minutes(schedule.horaFin);
      const slots = [];
      for (
        let minute = minutes(schedule.horaInicio);
        minute + schedule.duracionCitaMin <= endMinute;
        minute += schedule.duracionCitaMin
      ) {
        const start = new Date(dayStart.getTime() + minute * 60000);
        const end = new Date(
          start.getTime() + schedule.duracionCitaMin * 60000,
        );
        if (
          start.getTime() <= now ||
          appointments.some(
            (a) =>
              a.medicoId === schedule.medicoId &&
              a.fechaHoraInicio < end &&
              a.fechaHoraFin > start,
          )
        )
          continue;
        slots.push({
          medicoId: schedule.medicoId,
          medico: schedule.medico.usuario,
          consultorioId: schedule.consultorioId,
          consultorio: schedule.consultorio.nombre,
          inicio: start.toISOString(),
          fin: end.toISOString(),
        });
      }
      return slots;
    });
    return {
      fecha: dto.fecha,
      zonaHoraria: 'America/Lima',
      especialidadId: dto.especialidadId,
      turnos,
    };
  }
}
