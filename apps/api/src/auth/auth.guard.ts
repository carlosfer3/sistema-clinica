import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOWED_ROLES, PUBLIC_ROUTE } from './auth.decorators.js';
import { AuthRequest } from './auth.types.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const resource = `${request.method} ${request.route?.path ?? request.path}`;
    const authorization = request.headers.authorization;
    let subject: unknown;
    try {
      if (!authorization?.startsWith('Bearer '))
        throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<{ sub: unknown }>(
        authorization.slice(7),
      );
      subject = payload.sub;
      if (
        typeof subject !== 'number' ||
        !Number.isSafeInteger(subject) ||
        subject < 1
      ) {
        throw new Error('Invalid subject');
      }
    } catch {
      await this.audit.record(null, 'UNAUTHENTICATED', resource, request.ip);
      throw new UnauthorizedException();
    }
    // Read the current role and active flag; a token cannot preserve revoked access.
    const user = await this.prisma.usuario.findUnique({
      where: { id: subject as number },
      select: { id: true, rol: true, activo: true },
    });
    if (!user?.activo) {
      await this.audit.record(
        user?.id ?? null,
        'ACCESS_DENIED',
        resource,
        request.ip,
      );
      throw new UnauthorizedException();
    }
    request.user = { id: user.id, rol: user.rol };
    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(
      ALLOWED_ROLES,
      targets,
    );
    // New endpoints require an explicit role policy.
    if (!roles?.includes(user.rol)) {
      await this.audit.record(user.id, 'ACCESS_DENIED', resource, request.ip);
      throw new ForbiddenException();
    }
    return true;
  }
}
