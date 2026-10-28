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
    if (!user?.activo || !(await compare(password, user.passwordHash))) {
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
}
