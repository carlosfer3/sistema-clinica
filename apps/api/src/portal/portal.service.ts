import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AgendaService } from '../agenda/agenda.service.js';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';
import { PortalAppointmentsDto, PortalBookingDto } from './portal.dto.js';

const doctor = {
  id: true,
  usuario: { select: { nombres: true, apellidos: true } },
  especialidad: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agenda: AgendaService,
  ) {}

  private async patientId(actorId: number) {
    const patient = await this.prisma.paciente.findUnique({
      where: { usuarioId: actorId },
      select: { id: true },
    });
    if (!patient)
      throw new NotFoundException('Patient account has no linked profile');
    return patient.id;
  }

  async profile(actorId: number, ip?: string) {
    await this.audit.record(actorId, 'READ_OWN_PROFILE', 'portal/profile', ip);
    const profile = await this.prisma.paciente.findUnique({
      where: { usuarioId: actorId },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        tipoDocumento: true,
        numeroDocumento: true,
        fechaNacimiento: true,
        sexo: true,
        telefono: true,
        correo: true,
        direccion: true,
      },
    });
    if (!profile)
      throw new NotFoundException('Patient account has no linked profile');
    return profile;
  }

  async appointments(
    query: PortalAppointmentsDto,
    actorId: number,
    ip?: string,
  ) {
    await this.audit.record(
      actorId,
      'READ_OWN_APPOINTMENTS',
      'portal/appointments',
      ip,
    );
    const pacienteId = await this.patientId(actorId);
    const now = new Date();
    // Close overdue appointments that never reached arrival. A portal request
    // still awaiting admission is cancelled; a confirmed reservation is a no-show.
    await this.prisma.$transaction([
      this.prisma.cita.updateMany({
        where: {
          pacienteId,
          fechaHoraInicio: { lt: now },
          llegadaEn: null,
          estado: 'pendiente_confirmacion',
        },
        data: { estado: 'cancelada' },
      }),
      this.prisma.cita.updateMany({
        where: {
          pacienteId,
          fechaHoraInicio: { lt: now },
          llegadaEn: null,
          estado: { in: ['programada', 'confirmada', 'reprogramada'] },
        },
        data: { estado: 'no_asistio' },
      }),
    ]);
    const where: Prisma.CitaWhereInput = {
      pacienteId,
      ...(query.scope === 'upcoming'
        ? {
            fechaHoraInicio: { gte: new Date() },
            estado: {
              in: [
                'pendiente_confirmacion',
                'programada',
                'confirmada',
                'reprogramada',
              ],
            },
          }
        : query.scope === 'cancelled'
          ? { estado: 'cancelada' }
          : query.scope === 'past'
            ? { estado: { not: 'cancelada' }, OR: [{ fechaHoraInicio: { lt: new Date() } }, { estado: { in: ['atendida', 'no_asistio'] } }] }
            : {}),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.cita.findMany({
          where,
          select: {
            id: true,
            fechaHoraInicio: true,
            fechaHoraFin: true,
            estado: true,
            modalidad: true,
            llegadaEn: true,
            preparacionCompletadaEn: true,
            evaluacionPrevia: { select: { registradoEn: true, presionSistolica: true, presionDiastolica: true, frecuenciaCardiaca: true, saturacionOxigeno: true, pesoKg: true, tallaCm: true, temperaturaC: true, observaciones: true } },
            medico: { select: doctor },
          },
          orderBy: [
            { fechaHoraInicio: query.scope === 'upcoming' ? 'asc' : 'desc' },
            { id: 'asc' },
          ],
          skip: (query.pagina - 1) * query.limite,
          take: query.limite,
        }),
        this.prisma.cita.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      citas: rows.map((row) => ({
        id: row.id,
        inicio: row.fechaHoraInicio,
        fin: row.fechaHoraFin,
        estado: row.estado,
        modalidad: row.modalidad,
        llegadaEn: row.llegadaEn,
        preparacionCompletadaEn: row.preparacionCompletadaEn,
        evaluacionPrevia: row.evaluacionPrevia,
        medico: { id: row.medico.id, ...row.medico.usuario },
        especialidad: row.medico.especialidad,
      })),
      total,
      pagina: query.pagina,
      hayMas: query.pagina * query.limite < total,
    };
  }

  async history(query: NursingQueueDto, actorId: number, ip?: string) {
    await this.audit.record(actorId, 'READ_OWN_HISTORY', 'portal/history', ip);
    const pacienteId = await this.patientId(actorId);
    const rows = await this.prisma.consulta.findMany({
      where: { pacienteId },
      select: {
        id: true,
        fechaHora: true,
        motivo: true,
        indicaciones: true,
        estado: true,
        motivoAnulacion: true,
        medico: { select: doctor },
        diagnosticos: {
          select: { codigo: true, descripcion: true },
          orderBy: { orden: 'asc' },
        },
        recetaItems: {
          select: {
            id: true,
            medicamento: true,
            dosis: true,
            via: true,
            frecuencia: true,
            duracion: true,
            indicaciones: true,
          },
          orderBy: { orden: 'asc' },
        },
      },
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      consultas: rows.slice(0, query.limite),
      pagina: query.pagina,
      hayMas: rows.length > query.limite,
    };
  }

  async book(dto: PortalBookingDto, actorId: number, ip?: string) {
    const pacienteId = await this.patientId(actorId);
    return this.agenda.create(
      {
        medicoId: dto.medicoId,
        inicio: dto.inicio,
        motivo: dto.motivo,
        pacienteId,
        canalOrigen: 'portal',
      },
      actorId,
      ip,
    );
  }
}
