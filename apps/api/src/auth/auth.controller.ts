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
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @Roles(...Object.values(RolUsuario))
  me(@Req() req: AuthRequest) {
    return req.user!;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }
}
