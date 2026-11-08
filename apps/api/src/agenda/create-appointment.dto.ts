import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647, example: 1 })
  pacienteId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647, example: 1 })
  medicoId: number;

  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Turno futuro completo; zona explícita y segundos cero. Usar un instante devuelto por disponibilidad.',
    example: '2099-01-09T08:00:00-05:00',
  })
  inicio: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  @ApiPropertyOptional({ type: String, maxLength: 300, example: 'Control' })
  motivo?: string;

  @IsOptional()
  @IsIn(['presencial', 'telefono'])
  @ApiPropertyOptional({
    type: String,
    enum: ['presencial', 'telefono'],
    default: 'presencial',
    required: false,
  })
  canalOrigen: 'presencial' | 'telefono' = 'presencial';
}
