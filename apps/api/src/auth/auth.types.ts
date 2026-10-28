import { RolUsuario } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: number;
  rol: RolUsuario;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
