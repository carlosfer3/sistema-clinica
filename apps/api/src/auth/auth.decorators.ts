import { ApiBearerAuth, ApiExtension, ApiResponse } from '@nestjs/swagger';
import { ref } from '../openapi/schemas.js';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

export const PUBLIC_ROUTE = 'publicRoute';
export const ALLOWED_ROLES = 'allowedRoles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: RolUsuario[]) =>
  applyDecorators(
    SetMetadata(ALLOWED_ROLES, roles),
    ApiBearerAuth(),
    ApiExtension('x-roles', roles),
    ApiResponse({
      status: 401,
      description: 'Token ausente, inválido o expirado, o cuenta inactiva.',
      schema: ref('Error'),
    }),
    ApiResponse({
      status: 403,
      description: 'El rol actual no tiene permiso para esta operación.',
      schema: ref('Error'),
    }),
  );
