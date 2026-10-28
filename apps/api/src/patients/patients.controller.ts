import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { CreatePatientDto, SearchPatientsDto } from './patient.dto.js';
import { PatientsService } from './patients.service.js';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @Roles('admision')
  create(
    @Body() dto: CreatePatientDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.create(dto, req.user!.id, ip);
  }

  @Get()
  @Roles('admision', 'medico', 'enfermeria')
  search(
    @Query() dto: SearchPatientsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.search(dto, req.user!.id, ip);
  }

  @Get(':id')
  @Roles('admision', 'medico', 'enfermeria')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.findOne(id, req.user!.id, ip);
  }

  @Get(':id/clinical-profile')
  @Roles('medico', 'enfermeria')
  clinicalProfile(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.clinicalProfile(id, req.user!.id, ip);
  }
}
