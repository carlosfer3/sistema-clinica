import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePatientDto, SearchPatientsDto } from './patient.dto.js';

const demographics = {
  id: true,
  tipoDocumento: true,
  numeroDocumento: true,
  nombres: true,
  apellidos: true,
  fechaNacimiento: true,
  sexo: true,
  telefono: true,
  correo: true,
  direccion: true,
} satisfies Prisma.PacienteSelect;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePatientDto, actorId: number, ip?: string) {
    if (dto.tipoDocumento === 'DNI' && !/^\d{8}$/.test(dto.numeroDocumento)) {
      throw new BadRequestException('DNI must contain exactly 8 digits');
    }
    if (new Date(dto.fechaNacimiento) > new Date()) {
      throw new BadRequestException('Birth date cannot be in the future');
    }
    const { antecedentes, alergias, ...data } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const patient = await tx.paciente.create({
          data: {
            ...data,
            fechaNacimiento: new Date(dto.fechaNacimiento),
            antecedentes: {
              create: antecedentes?.map((item) => ({
                tipo: item.tipo,
                descripcion: item.descripcion,
                desde: item.desde ? new Date(item.desde) : undefined,
              })),
            },
            alergias: { create: alergias },
          },
          select: demographics,
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actorId,
            accion: 'CREATE_PATIENT',
            recurso: `patients/${patient.id}`,
            ipOrigen: ip,
          },
        });
        return patient;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.paciente.findUnique({
          where: {
            tipoDocumento_numeroDocumento: {
              tipoDocumento: dto.tipoDocumento,
              numeroDocumento: dto.numeroDocumento,
            },
          },
          select: { id: true },
        });
        if (existing) {
          await this.audit.record(
            actorId,
            'DUPLICATE_PATIENT',
            `patients/${existing.id}`,
            ip,
          );
          throw new ConflictException({
            message: 'Patient document already exists',
            patientId: existing.id,
          });
        }
      }
      throw error;
    }
  }

  async search(dto: SearchPatientsDto, actorId: number, ip?: string) {
    // Audit before returning data, without storing names or document numbers in logs.
    await this.audit.record(actorId, 'SEARCH_PATIENTS', 'patients', ip);
    return this.prisma.paciente.findMany({
      where: {
        OR: [
          { numeroDocumento: { contains: dto.q, mode: 'insensitive' } },
          { nombres: { contains: dto.q, mode: 'insensitive' } },
          { apellidos: { contains: dto.q, mode: 'insensitive' } },
        ],
      },
      select: demographics,
      take: dto.limit,
      orderBy: [{ apellidos: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number, actorId: number, ip?: string) {
    await this.audit.record(actorId, 'READ_PATIENT', `patients/${id}`, ip);
    const patient = await this.prisma.paciente.findUnique({
      where: { id },
      select: demographics,
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async clinicalProfile(id: number, actorId: number, ip?: string) {
    await this.audit.record(
      actorId,
      'READ_CLINICAL_PROFILE',
      `patients/${id}/clinical-profile`,
      ip,
    );
    const patient = await this.prisma.paciente.findUnique({
      where: { id },
      select: { ...demographics, antecedentes: true, alergias: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }
}
