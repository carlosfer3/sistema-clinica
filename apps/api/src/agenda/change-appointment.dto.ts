import { PickType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto.js';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RescheduleAppointmentDto extends PickType(CreateAppointmentDto, [
  'inicio',
] as const) {
  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  @ApiProperty({ type: String, maxLength: 300, description: 'Motivo obligatorio de la reprogramación.' })
  motivo: string;
}

export class CancelAppointmentDto {}

// Portal rescheduling retains its existing contract; the required reason belongs to admission.
export class PortalRescheduleAppointmentDto extends PickType(CreateAppointmentDto, ['inicio'] as const) {}
