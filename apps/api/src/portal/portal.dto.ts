import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength, MaxLength, IsInt, Min, Max, IsDateString, Matches, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

export class PortalHistoryDto extends NursingQueueDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 100 })
  buscar?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 32767 })
  especialidadId?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiPropertyOptional({ type: String, format: 'date' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiPropertyOptional({ type: String, format: 'date' })
  hasta?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  @ApiPropertyOptional({ type: Boolean })
  conReceta?: boolean;
}
