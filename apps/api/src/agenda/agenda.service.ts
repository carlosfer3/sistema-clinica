import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityDto } from './availability.dto.js';

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
