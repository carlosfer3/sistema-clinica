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
  pacienteId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  medicoId: number;

  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  inicio: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  motivo?: string;

  @IsOptional()
  @IsIn(['presencial', 'telefono'])
  canalOrigen: 'presencial' | 'telefono' = 'presencial';
}
