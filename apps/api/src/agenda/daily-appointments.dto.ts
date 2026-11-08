import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EstadoCita } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NursingQueueDto } from './nursing-queue.dto.js';

export class DailyAppointmentsDto extends NursingQueueDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 2147483647 })
  medicoId?: number;

  @IsOptional()
  @IsEnum(EstadoCita)
  @ApiPropertyOptional({ enum: EstadoCita })
  estado?: EstadoCita;
}
