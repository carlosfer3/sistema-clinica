import { Controller, Get, Ip, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { AvailabilityDto } from './availability.dto.js';
import { AgendaService } from './agenda.service.js';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

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
