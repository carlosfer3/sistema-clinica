import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

export const PUBLIC_ROUTE = 'publicRoute';
export const ALLOWED_ROLES = 'allowedRoles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: RolUsuario[]) =>
  SetMetadata(ALLOWED_ROLES, roles);
