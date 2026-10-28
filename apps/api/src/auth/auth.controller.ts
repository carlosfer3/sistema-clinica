import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';

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

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }
}
