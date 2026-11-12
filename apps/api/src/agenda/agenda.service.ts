import { DailyAppointmentsDto } from './daily-appointments.dto.js';
import { DirectoryDto } from './directory.dto.js';
import { VitalSignsDto } from './vital-signs.dto.js';
import { NursingQueueDto } from './nursing-queue.dto.js';
import { NursingWorklistDto } from './nursing-worklist.dto.js';
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

  async admissionSummary(actorId: number, ip?: string) {
    const now = new Date(Date.now());
    const fecha = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${fecha}T00:00:00-05:00`);
    const day = { gte: start, lt: new Date(start.getTime() + 86400000) };
    await this.audit.record(actorId, 'READ_ADMISSION_SUMMARY', 'agenda/admission-summary', ip);
    const [citasHoy, llegadasRegistradas, pendientesLlegada, solicitudesPendientes] = await this.prisma.$transaction([
      this.prisma.cita.count({ where: { fechaHoraInicio: day } }),
      this.prisma.cita.count({ where: { fechaHoraInicio: day, llegadaEn: { not: null } } }),
      this.prisma.cita.count({ where: { fechaHoraInicio: day, modalidad: 'presencial', estado: { in: ['programada', 'confirmada', 'reprogramada'] }, llegadaEn: null } }),
      this.prisma.cita.count({ where: { fechaHoraInicio: { gt: now }, canalOrigen: 'portal', estado: 'pendiente_confirmacion' } }),
    ], { isolationLevel: 'RepeatableRead' });
    return { fecha, zonaHoraria: 'America/Lima', citasHoy, llegadasRegistradas, pendientesLlegada, solicitudesPendientes };
  }

  async directory(query: DirectoryDto, actorId: number, ip?: string) {
    await this.audit.record(actorId, 'READ_MEDICAL_DIRECTORY', 'agenda/directory', ip);
    const eligible = { usuario: { activo: true, rol: 'medico' as const }, horarios: { some: { consultorio: { activo: true } } } };
    const especialidades = await this.prisma.especialidad.findMany({
      where: { medicos: { some: eligible } }, select: { id: true, nombre: true }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    const rows = !query.especialidadId && !query.buscar ? [] : await this.prisma.medico.findMany({
      where: {
        ...eligible,
        especialidadId: query.especialidadId,
        ...(query.buscar ? { AND: query.buscar.split(/\s+/).map(word => ({ OR: [
          { usuario: { nombres: { contains: word, mode: 'insensitive' as const } } },
          { usuario: { apellidos: { contains: word, mode: 'insensitive' as const } } },
        ] })) } : {}),
      },
      select: { id: true, usuario: { select: { nombres: true, apellidos: true } }, especialidad: { select: { id: true, nombre: true } } },
      orderBy: [{ usuario: { apellidos: 'asc' } }, { usuario: { nombres: 'asc' } }, { id: 'asc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return { especialidades, pagina: query.pagina, limite: query.limite, hayMas: rows.length > query.limite, medicos: rows.slice(0, query.limite).map(row => ({ id: row.id, ...row.usuario, especialidad: row.especialidad })) };
  }

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

  async reschedule(
    id: number,
    inicio: string,
    actorId: number,
    ip?: string,
    ownerUserId?: number,
    motivo?: string,
  ) {
    return this.create(
      { inicio, motivo: motivo?.trim() } as CreateAppointmentDto,
      actorId,
      ip,
      id,
      ownerUserId,
    );
  }

  private async mutableAppointment(
    tx: import('@prisma/client').Prisma.TransactionClient,
    id: number,
    ownerUserId?: number,
  ) {
    await tx.$queryRaw`SELECT id FROM cita WHERE id = ${id} FOR UPDATE`;
    const appointment = await tx.cita.findUnique({
      where: {
        id,
        ...(ownerUserId === undefined
          ? {}
          : { paciente: { usuarioId: ownerUserId } }),
      },
      include: {
        consulta: { select: { id: true } },
        evaluacionPrevia: { select: { id: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (
      ![
        'pendiente_confirmacion',
        'programada',
        'confirmada',
        'reprogramada',
      ].includes(appointment.estado) ||
      appointment.llegadaEn ||
      appointment.preparacionCompletadaEn ||
      appointment.consulta ||
      appointment.evaluacionPrevia
    ) {
      throw new ConflictException(
        'Appointment cannot be changed after arrival or closure',
      );
    }
    return appointment;
  }

  async cancel(id: number, actorId: number, ip?: string, ownerUserId?: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const previous = await this.mutableAppointment(tx, id, ownerUserId);
        const result = await tx.cita.update({
          where: { id },
          data: { estado: 'cancelada' },
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
            accion: 'CANCEL_CITA',
            detalles: JSON.stringify({
              estadoAnterior: previous.estado,
              inicio: previous.fechaHoraInicio,
              fin: previous.fechaHoraFin,
            }),
            recurso: `agenda/appointments/${id}`,
            ipOrigen: ip,
          },
        });
        return result;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async create(
    dto: Omit<CreateAppointmentDto, 'canalOrigen'> & {
      canalOrigen: 'presencial' | 'telefono' | 'portal';
    },
    actorId: number,
    ip?: string,
    rescheduleId?: number,
    ownerUserId?: number,
  ) {
    const start = new Date(dto.inicio);
    // Shift the instant to Lima wall-clock components, independent of server TZ.
    const local = new Date(start.getTime() - 5 * 3600000);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    const weekday = local.getUTCDay() || 7;
    return this.prisma.$transaction(
      async (tx) => {
        let previous:
          Awaited<ReturnType<AgendaService['mutableAppointment']>> | undefined;
        if (rescheduleId !== undefined) {
          previous = await this.mutableAppointment(
            tx,
            rescheduleId,
            ownerUserId,
          );
          if (previous.fechaHoraInicio.getTime() === start.getTime())
            throw new BadRequestException('Choose a different slot');
          dto = {
            inicio: dto.inicio,
            medicoId: previous.medicoId,
            pacienteId: previous.pacienteId,
            canalOrigen:
              previous.canalOrigen === 'portal'
                ? 'presencial'
                : previous.canalOrigen,
          };
        }
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
            id: rescheduleId === undefined ? undefined : { not: rescheduleId },
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
        const appointmentData = {
          data: {
            pacienteId: dto.pacienteId,
            medicoId: dto.medicoId,
            fechaHoraInicio: start,
            fechaHoraFin: end,
            motivo: dto.motivo,
            canalOrigen: dto.canalOrigen,
            modalidad: 'presencial',
            creadoPor: actorId,
            ...(dto.canalOrigen === 'portal'
              ? { estado: 'pendiente_confirmacion' as const }
              : {}),
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
        } satisfies import('@prisma/client').Prisma.CitaCreateArgs;
        const appointment =
          rescheduleId === undefined
            ? await tx.cita.create(appointmentData)
            : await tx.cita.update({
                where: { id: rescheduleId },
                data: {
                  fechaHoraInicio: start,
                  fechaHoraFin: end,
                  estado:
                    ownerUserId !== undefined ||
                    previous?.estado === 'pendiente_confirmacion'
                      ? 'pendiente_confirmacion'
                      : 'reprogramada',
                },
                select: appointmentData.select,
              });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion:
              rescheduleId === undefined ? 'CREATE_CITA' : 'RESCHEDULE_CITA',
            ...(previous
              ? {
                  detalles: JSON.stringify({
                    estadoAnterior: previous.estado,
                    motivoReprogramacion: dto.motivo,
                    inicioAnterior: previous.fechaHoraInicio,
                    finAnterior: previous.fechaHoraFin,
                    inicio: start,
                    fin: end,
                  }),
                }
              : {}),
            recurso: `agenda/appointments/${appointment.id}`,
            ipOrigen: ip,
          },
        });
        return appointment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async reject(id: number, reason: string, actorId: number, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cita WHERE id = ${id} FOR UPDATE`;
      const appointment = await tx.cita.findUnique({
        where: { id },
        include: {
          consulta: { select: { id: true } },
          evaluacionPrevia: { select: { id: true } },
        },
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (appointment.canalOrigen !== 'portal' || appointment.estado !== 'pendiente_confirmacion' ||
          appointment.llegadaEn || appointment.preparacionCompletadaEn || appointment.consulta || appointment.evaluacionPrevia) {
        throw new ConflictException('Only pending portal requests can be rejected');
      }
      const result = await tx.cita.update({
        where: { id },
        data: { estado: 'cancelada' },
        select: { id: true, pacienteId: true, medicoId: true, fechaHoraInicio: true, fechaHoraFin: true, estado: true, canalOrigen: true, modalidad: true },
      });
      await tx.bitacoraAuditoria.create({ data: {
        usuarioId: actorId,
        accion: 'REJECT_CITA',
        recurso: `agenda/appointments/${id}`,
        detalles: JSON.stringify({ estadoAnterior: appointment.estado, motivoRechazo: reason.trim() }),
        ipOrigen: ip,
      } });
      return result;
    }, { isolationLevel: 'ReadCommitted' });
  }

  async confirm(id: number, actorId: number, ip?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM cita WHERE id = ${id} FOR UPDATE`;
        const appointment = await tx.cita.findUnique({
          where: { id },
          include: {
            consulta: { select: { id: true } },
            evaluacionPrevia: { select: { id: true } },
          },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');
        if (
          appointment.canalOrigen !== 'portal' ||
          appointment.fechaHoraInicio.getTime() <= Date.now() ||
          appointment.llegadaEn ||
          appointment.preparacionCompletadaEn ||
          appointment.consulta ||
          appointment.evaluacionPrevia ||
          !['pendiente_confirmacion', 'confirmada'].includes(appointment.estado)
        ) {
          throw new ConflictException(
            'Appointment is not an eligible portal request',
          );
        }
        const select = {
          id: true,
          pacienteId: true,
          medicoId: true,
          fechaHoraInicio: true,
          fechaHoraFin: true,
          estado: true,
          canalOrigen: true,
          modalidad: true,
        } as const;
        if (appointment.estado === 'confirmada')
          return tx.cita.findUniqueOrThrow({ where: { id }, select });
        const doctor = await tx.medico.findFirst({
          where: {
            id: appointment.medicoId,
            usuario: { activo: true, rol: 'medico' },
          },
          select: { id: true },
        });
        if (!doctor)
          throw new ConflictException('Doctor is no longer available');
        const result = await tx.cita.update({
          where: { id },
          data: { estado: 'confirmada' },
          select,
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'CONFIRM_CITA',
            recurso: `agenda/appointments/${id}`,
            ipOrigen: ip,
          },
        });
        return result;
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
    const fecha =
      query.fecha ??
      new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${fecha}T00:00:00-05:00`);
    await this.audit.record(
      actorId,
      'READ_DAILY_APPOINTMENTS',
      'agenda/appointments',
      ip,
    );
    const rows = await this.prisma.cita.findMany({
      where: {
        fechaHoraInicio: query.pendientesPortal
          ? { gt: new Date() }
          : {
              gte: start,
              lt: new Date(start.getTime() + 86400000),
            },
        medicoId: query.medicoId,
        estado: query.pendientesPortal
          ? 'pendiente_confirmacion'
          : query.estado,
        ...(query.pendientesPortal ? { canalOrigen: 'portal' as const } : {}),
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

  async nursingQueue(query: NursingWorklistDto, actorId: number, ip?: string) {
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const dayStart = new Date(`${today}T00:00:00-05:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    await this.audit.record(
      actorId,
      'READ_NURSING_QUEUE',
      'agenda/nursing-queue',
      ip,
    );
    const baseWhere: import('@prisma/client').Prisma.CitaWhereInput = {
      fechaHoraInicio: { gte: dayStart, lt: dayEnd },
      llegadaEn: { not: null }, preparacionCompletadaEn: null,
      modalidad: 'presencial', estado: { in: ['programada', 'confirmada', 'reprogramada'] },
    };
    const especialidades = await this.prisma.especialidad.findMany({
      where: { medicos: { some: { citas: { some: baseWhere } } } },
      select: { id: true, nombre: true }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    const appointments = await this.prisma.cita.findMany({
      where: {
        ...baseWhere,
        ...(query.especialidadId ? { medico: { especialidadId: query.especialidadId } } : {}),
        ...(query.buscar ? { AND: query.buscar.split(/\s+/).map(word => ({ paciente: { OR: [
          { nombres: { contains: word, mode: 'insensitive' as const } },
          { apellidos: { contains: word, mode: 'insensitive' as const } },
          { numeroDocumento: { contains: word, mode: 'insensitive' as const } },
        ] } })) } : {}),
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
      especialidades,
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

  async medicalQueue(query: NursingQueueDto, actorId: number, ip?: string) {
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const dayStart = new Date(`${today}T00:00:00-05:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    await this.audit.record(
      actorId,
      'READ_MEDICAL_QUEUE',
      'agenda/medical-queue',
      ip,
    );
    const appointments = await this.prisma.cita.findMany({
      where: {
        fechaHoraInicio: { gte: dayStart, lt: dayEnd },
        llegadaEn: { not: null, lte: new Date(Date.now()) },
        preparacionCompletadaEn: { not: null, lte: new Date(Date.now()) },
        medico: { usuarioId: actorId },
        evaluacionPrevia: { isNot: null },
        consulta: { is: null },
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
          estadoPreparacion: 'completada',
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
