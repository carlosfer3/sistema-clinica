import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateConsultationDto,
  DiagnosisSearchDto,
} from './consultation.dto.js';

const details = {
  diagnosticos: { orderBy: { orden: 'asc' as const } },
  recetaItems: { orderBy: { orden: 'asc' as const } },
} satisfies Prisma.ConsultaInclude;

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async diagnoses(query: DiagnosisSearchDto, actorId: number, ip?: string) {
    await this.audit.record(
      actorId,
      'READ_CIE10',
      'consultations/diagnoses',
      ip,
    );
    return this.prisma.cie10.findMany({
      where: query.q
        ? {
            OR: [
              { codigo: { contains: query.q, mode: 'insensitive' } },
              { descripcion: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {},
      select: { codigo: true, descripcion: true },
      orderBy: { codigo: 'asc' },
      take: 50,
    });
  }

  async list(actorId: number, ip?: string) {
    await this.audit.record(actorId, 'READ_OWN_CONSULTATIONS', 'consultations', ip);
    return this.prisma.consulta.findMany({
      where: { medico: { usuarioId: actorId } },
      include: { ...details, paciente: { select: { nombres: true, apellidos: true, numeroDocumento: true } } },
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }], take: 50,
    });
  }

  async annul(id: number, motivo: string, actorId: number, ip?: string) {
    if (!motivo.trim() || motivo.length > 300) throw new BadRequestException('Annulment reason required');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM consulta WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.consulta.findFirst({ where: { id, medico: { usuarioId: actorId } } });
      if (!existing) throw new NotFoundException('Consultation not accessible');
      if (existing.estado === 'anulado') throw new ConflictException('Consultation already annulled');
      const result = await tx.consulta.update({ where: { id }, data: { estado: 'anulado', motivoAnulacion: motivo.trim(), anuladoPor: actorId, anuladoEn: new Date() }, include: details });
      await tx.bitacoraAuditoria.create({ data: { usuarioId: actorId, accion: 'ANNUL_CONSULTATION', recurso: `consultations/${id}`, ipOrigen: ip, detalles: JSON.stringify({ motivo: motivo.trim() }) } });
      return result;
    });
  }

  async create(dto: CreateConsultationDto, actorId: number, ip?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM cita WHERE id = ${dto.citaId} FOR UPDATE`;
        const appointment = await tx.cita.findFirst({
          where: {
            id: dto.citaId,
            medico: {
              usuarioId: actorId,
              usuario: { activo: true, rol: 'medico' },
            },
          },
          select: {
            id: true,
            pacienteId: true,
            medicoId: true,
            fechaHoraInicio: true,
            estado: true,
            modalidad: true,
            llegadaEn: true,
            preparacionCompletadaEn: true,
            evaluacionPrevia: { select: { id: true } },
            consulta: { select: { id: true } },
          },
        });
        if (!appointment)
          throw new NotFoundException(
            'Appointment not found for the assigned doctor',
          );
        const now = new Date(Date.now());
        const day = (date: Date) =>
          new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10);
        if (day(appointment.fechaHoraInicio) !== day(now))
          throw new BadRequestException(
            'Consultation requires an appointment for today in America/Lima',
          );
        if (
          appointment.modalidad !== 'presencial' ||
          !['programada', 'confirmada', 'reprogramada'].includes(
            appointment.estado,
          ) ||
          !appointment.llegadaEn ||
          appointment.llegadaEn > now ||
          !appointment.preparacionCompletadaEn ||
          appointment.preparacionCompletadaEn > now ||
          !appointment.evaluacionPrevia ||
          appointment.consulta
        )
          throw new ConflictException(
            'Appointment must have completed preparation and no previous consultation',
          );
        const codes = dto.diagnosticos.map((diagnosis) => diagnosis.codigo);
        const catalog = await tx.cie10.findMany({
          where: { codigo: { in: codes } },
          select: { codigo: true, descripcion: true },
        });
        if (catalog.length !== codes.length)
          throw new BadRequestException(
            'All diagnoses must exist in the CIE-10 catalog',
          );
        const descriptions = new Map(
          catalog.map((entry) => [entry.codigo, entry.descripcion]),
        );
        const consultation = await tx.consulta.create({
          data: {
            citaId: appointment.id,
            pacienteId: appointment.pacienteId,
            medicoId: appointment.medicoId,
            fechaHora: now,
            motivo: dto.motivo.trim(),
            indicaciones: dto.indicaciones.trim(),
            diagnosticos: {
              create: codes.map((codigo, index) => ({
                codigo,
                descripcion: descriptions.get(codigo)!,
                orden: index + 1,
                tipo: index === 0 ? 'principal' : 'secundario',
              })),
            },
            recetaItems: {
              create: (dto.receta ?? []).map((item, index) => ({
                orden: index + 1,
                medicamento: item.medicamento.trim(),
                dosis: item.dosis.trim(),
                via: item.via.trim(),
                frecuencia: item.frecuencia.trim(),
                duracion: item.duracion.trim(),
                indicaciones: item.indicaciones?.trim() || null,
              })),
            },
          },
          include: details,
        });
        await tx.cita.update({
          where: { id: appointment.id },
          data: { estado: 'atendida' },
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'CREATE_CONSULTATION',
            recurso: `consultations/${consultation.id}`,
            ipOrigen: ip,
          },
        });
        return consultation;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async findOne(id: number, actorId: number, ip?: string) {
    await this.audit.record(
      actorId,
      'READ_CONSULTATION',
      `consultations/${id}`,
      ip,
    );
    const consultation = await this.prisma.consulta.findFirst({
      where: { id, medico: { usuarioId: actorId } },
      include: details,
    });
    if (!consultation)
      throw new NotFoundException(
        'Consultation not found for the assigned doctor',
      );
    return consultation;
  }
}
