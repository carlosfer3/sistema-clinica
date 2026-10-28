import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    usuarioId: number | null,
    accion: string,
    recurso: string,
    ip?: string,
  ) {
    await this.prisma.bitacoraAuditoria.create({
      data: { usuarioId, accion, recurso: recurso.slice(0, 100), ipOrigen: ip },
    });
  }
}
