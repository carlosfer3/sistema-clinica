import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ArrivalParamsDto } from './arrival-params.dto.js';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { AvailabilityDto } from './availability.dto.js';
import { AgendaService } from './agenda.service.js';
import { CreateAppointmentDto } from './create-appointment.dto.js';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('catalog')
  @Roles('admision', 'medico', 'enfermeria')
  catalog(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.agenda.catalog(req.user!.id, ip);
  }

  @Post('appointments')
  @Roles('admision')
  create(
    @Body() dto: CreateAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.create(dto, req.user!.id, ip);
  }

  @Post('appointments/:id/arrival')
  @HttpCode(200)
  @Roles('admision')
  registerArrival(
    @Param() params: ArrivalParamsDto,
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    if (body && Object.keys(body).length > 0) {
      throw new BadRequestException(
        'Arrival registration does not accept body fields',
      );
    }
    return this.agenda.registerArrival(params.id, req.user!.id, ip);
  }

  @Get('availability')
  @Roles('admision', 'medico', 'enfermeria')
  availability(
    @Query() dto: AvailabilityDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.availability(dto, req.user!.id, ip);
  }
}
