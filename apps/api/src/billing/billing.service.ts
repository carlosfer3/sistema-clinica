import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  ChargesQueryDto,
  CreateChargeDto,
  SettleChargeDto,
} from './billing.dto.js';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';

const fields = {
  id: true,
  concepto: true,
  montoCentimos: true,
  estado: true,
  creadoEn: true,
  pagadoEn: true,
  metodoPago: true,
  referencia: true,
} as const;
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(dni: string, actor: number, ip?: string) {
    await this.audit.record(
      actor,
      'BILLING_SEARCH_PATIENT',
      'billing/patients',
      ip,
    );
    return this.prisma.paciente.findMany({
      where: { tipoDocumento: 'DNI', numeroDocumento: dni },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        numeroDocumento: true,
      },
      take: 1,
    });
  }
  async create(dto: CreateChargeDto, actor: number, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.paciente.findUnique({
          where: { id: dto.pacienteId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Patient not found');
      const charge = await tx.cobro.create({
        data: {
          pacienteId: dto.pacienteId,
          concepto: dto.concepto,
          montoCentimos: dto.montoCentimos,
          creadoPor: actor,
        },
        select: fields,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          usuarioId: actor,
          accion: 'CREATE_CHARGE',
          recurso: `billing/charges/${charge.id}`,
          ipOrigen: ip,
        },
      });
      return charge;
    });
  }
  async list(query: ChargesQueryDto, actor: number, ip?: string) {
    await this.audit.record(actor, 'READ_CHARGES', 'billing/charges', ip);
    const rows = await this.prisma.cobro.findMany({
      where: { pacienteId: query.pacienteId },
      select: {
        ...fields,
        paciente: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            numeroDocumento: true,
          },
        },
      },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      cobros: rows.slice(0, query.limite),
      hayMas: rows.length > query.limite,
      pagina: query.pagina,
      moneda: 'PEN',
    };
  }
  async own(query: NursingQueueDto, actor: number, ip?: string) {
    await this.audit.record(actor, 'READ_OWN_PAYMENTS', 'portal/payments', ip);
    const patient = await this.prisma.paciente.findUnique({
      where: { usuarioId: actor },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Linked patient not found');
    const [rows, sum] = await this.prisma.$transaction(
      [
        this.prisma.cobro.findMany({
          where: { pacienteId: patient.id },
          select: fields,
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          skip: (query.pagina - 1) * query.limite,
          take: query.limite + 1,
        }),
        this.prisma.cobro.aggregate({
          where: { pacienteId: patient.id, estado: 'pendiente' },
          _sum: { montoCentimos: true },
          _count: true,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      cobros: rows.slice(0, query.limite),
      hayMas: rows.length > query.limite,
      pagina: query.pagina,
      moneda: 'PEN',
      saldoPendienteCentimos: sum._sum.montoCentimos ?? 0,
      cantidadPendientes: sum._count,
    };
  }
  async settle(id: number, dto: SettleChargeDto, actor: number, ip?: string) {
    if (dto.metodoPago !== 'efectivo' && !dto.referencia?.trim())
      throw new BadRequestException('Payment reference is required');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM cobro WHERE id = ${id} FOR UPDATE`;
        const charge = await tx.cobro.findUnique({
          where: { id },
          select: fields,
        });
        if (!charge) throw new NotFoundException('Charge not found');
        if (charge.estado === 'pagado') {
          if (
            charge.metodoPago !== dto.metodoPago ||
            (charge.referencia ?? '') !== (dto.referencia?.trim() ?? '')
          )
            throw new ConflictException('Payment is already recorded');
          return charge;
        }
        const result = await tx.cobro.update({
          where: { id },
          data: {
            estado: 'pagado',
            pagadoEn: new Date(),
            pagadoPor: actor,
            metodoPago: dto.metodoPago,
            referencia: dto.referencia?.trim(),
          },
          select: fields,
        });
        await tx.bitacoraAuditoria.create({
          data: {
            usuarioId: actor,
            accion: 'SETTLE_CHARGE',
            recurso: `billing/charges/${id}`,
            ipOrigen: ip,
          },
        });
        return result;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async receipt(id: number, actor: number, ip?: string) {
    await this.audit.record(
      actor,
      'READ_OWN_RECEIPT',
      `portal/payments/${id}/receipt`,
      ip,
    );
    const charge = await this.prisma.cobro.findFirst({
      where: { id, estado: 'pagado', paciente: { usuarioId: actor } },
      select: fields,
    });
    if (!charge)
      throw new NotFoundException('Paid charge not found for this patient');
    return { ...charge, moneda: 'PEN', tipo: 'Constancia interna de pago' };
  }
}
