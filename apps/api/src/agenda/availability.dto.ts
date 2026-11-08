import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AvailabilityDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2099-01-09',
    description:
      'Fecha local de America/Lima; fecha pasada devuelve turnos vacíos.',
  })
  fecha: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  @ApiProperty({ type: Number, minimum: 1, maximum: 32767, example: 1 })
  especialidadId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 2147483647,
    example: 1,
  })
  medicoId?: number;
}
