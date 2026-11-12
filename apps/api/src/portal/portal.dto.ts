import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';
import { CreateAppointmentDto } from '../agenda/create-appointment.dto.js';

export class PortalAppointmentsDto extends NursingQueueDto {
  @IsIn(['upcoming', 'past', 'cancelled', 'all'])
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled', 'all'], default: 'upcoming' })
  scope: 'upcoming' | 'past' | 'cancelled' | 'all' = 'upcoming';
}

export class PortalBookingDto extends PickType(CreateAppointmentDto, [
  'medicoId',
  'inicio',
  'motivo',
] as const) {}
