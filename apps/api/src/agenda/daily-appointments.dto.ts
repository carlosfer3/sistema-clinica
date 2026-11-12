import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { EstadoCita } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { NursingQueueDto } from './nursing-queue.dto.js';

export class DailyAppointmentsDto extends NursingQueueDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Todas las solicitudes futuras pendientes del portal, sin limitar al día.',
  })
  pendientesPortal?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description:
      'Día local en America/Lima. Si se omite, se usa hoy. Admite fechas pasadas y futuras.',
  })
  fecha?: string;

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
