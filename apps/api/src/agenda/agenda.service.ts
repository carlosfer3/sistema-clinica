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
