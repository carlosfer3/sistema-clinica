import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, ip?: string) {
    const user = await this.prisma.usuario.findUnique({ where: { username } });
    if (
      !user?.activo ||
      user.rol === 'paciente' ||
      !(await compare(password, user.passwordHash))
    ) {
      await this.audit.record(
        user?.id ?? null,
        'LOGIN_FAILED',
        'auth/login',
        ip,
      );
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.audit.record(user.id, 'LOGIN', 'auth/login', ip);
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
    };
  }

  async patientLogin(identifier: string, password: string, ip?: string) {
    // The demographic identifier resolves an existing account; knowing an ID
    // or email never creates an account or grants access by itself.
    const value = identifier.trim();
    const matches = await this.prisma.paciente.findMany({
      where: /^\d{8}$/.test(value)
        ? { tipoDocumento: 'DNI', numeroDocumento: value }
        : { correo: { equals: value, mode: 'insensitive' } },
      select: { usuarioId: true },
      take: 2,
    });
    // A shared email cannot silently select one patient's medical records.
    const accountId = matches.length === 1 ? matches[0].usuarioId : null;
    const user = accountId
      ? await this.prisma.usuario.findUnique({
          where: { id: accountId, rol: 'paciente', activo: true },
          select: { id: true, activo: true, rol: true, passwordHash: true },
        })
      : null;
    if (
      !user?.activo ||
      user.rol !== 'paciente' ||
      !(await compare(password, user.passwordHash))
    ) {
      await this.audit.record(
        user?.id ?? null,
        'LOGIN_FAILED',
        'auth/patient-login',
        ip,
      );
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.audit.record(user.id, 'LOGIN', 'auth/patient-login', ip);
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
    };
  }
}
