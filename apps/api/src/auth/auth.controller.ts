import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { ApiProperty } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Ip, Post, Req } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public, Roles } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './auth.types.js';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 50,
    example: 'demo.admision',
  })
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 1,
    maxLength: 72,
    writeOnly: true,
    description:
      'Contraseña local; no se incluyen credenciales reales en la documentación.',
  })
  password: string;
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiContract('Consultar sesión actual', 'Session', {
    description:
      'Devuelve solo ID y rol actual de la cuenta activa; admite cualquier rol autenticado.',
  })
  @Get('me')
  @Roles(...Object.values(RolUsuario))
  me(@Req() req: AuthRequest) {
    return req.user!;
  }

  @ApiContract('Iniciar sesión', 'Login', {
    description:
      'Público. Devuelve JWT con vigencia de una hora. No expone el hash de contraseña.',
    errors: {
      400: 'Credenciales mal formadas o campos desconocidos.',
      401: 'Credenciales incorrectas o cuenta inactiva.',
    },
  })
  @ApiBody({ type: LoginDto })
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }
}
