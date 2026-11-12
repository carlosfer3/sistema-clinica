import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { ApiProperty } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Ip, Post, Req } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import {
  IsString,
  MaxLength,
  MinLength,
  ValidateBy,
  isEmail,
} from 'class-validator';
import { Transform } from 'class-transformer';
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

export class PatientLoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  @ValidateBy({
    name: 'patientIdentifier',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && (/^\d{8}$/.test(value) || isEmail(value)),
      defaultMessage: () =>
        'identifier must be an 8-digit DNI or email address',
    },
  })
  @ApiProperty({
    type: String,
    maxLength: 120,
    description:
      'DNI de 8 dígitos o correo del paciente. No admite nombre de usuario.',
    example: '87654321',
  })
  identifier: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  @ApiProperty({
    type: String,
    format: 'password',
    writeOnly: true,
    minLength: 1,
    maxLength: 72,
  })
  password: string;
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiContract('Iniciar sesión como paciente con DNI o correo', 'Login', {
    description:
      'Público. Requiere contraseña y cuenta de paciente activa vinculada a una ficha. Correos compartidos no seleccionan un paciente automáticamente.',
    errors: {
      400: 'DNI/correo o cuerpo inválido.',
      401: 'Credenciales incorrectas o acceso no disponible.',
    },
  })
  @ApiBody({ type: PatientLoginDto })
  @Public()
  @Post('patient-login')
  @HttpCode(200)
  patientLogin(@Body() dto: PatientLoginDto, @Ip() ip: string) {
    return this.auth.patientLogin(dto.identifier, dto.password, ip);
  }

  @ApiContract('Consultar sesión actual', 'Session', {
    description:
      'Devuelve solo ID y rol actual de la cuenta activa; admite cualquier rol autenticado.',
  })
  @Get('me')
  @Roles(...Object.values(RolUsuario))
  me(@Req() req: AuthRequest) {
    return req.user!;
  }

  @ApiContract('Iniciar sesión como personal', 'Login', {
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
