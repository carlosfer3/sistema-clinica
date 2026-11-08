import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @IsIn(['DNI', 'CE', 'PASAPORTE'])
  @ApiProperty({
    type: String,
    enum: ['DNI', 'CE', 'PASAPORTE'],
    example: 'DNI',
  })
  tipoDocumento: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{1,15}$/)
  @ApiProperty({
    type: String,
    pattern: '^[A-Za-z0-9]{1,15}$',
    description:
      'DNI: exactamente 8 dígitos; CE/PASAPORTE: hasta 15 caracteres alfanuméricos.',
    example: '87654321',
  })
  numeroDocumento: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiProperty({ type: String, maxLength: 100, example: 'Paciente Ficticio' })
  nombres: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiProperty({ type: String, maxLength: 100, example: 'Prueba' })
  apellidos: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'YYYY-MM-DD; no puede ser futura.',
    example: '1990-01-01',
  })
  fechaNacimiento: string;

  @IsIn(['M', 'F'])
  @ApiProperty({ type: String, enum: ['M', 'F'] })
  sexo: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,20}$/)
  @ApiProperty({
    type: String,
    pattern: '^\\+?[0-9 ()-]{6,20}$',
    example: '999888777',
  })
  telefono: string;

  @IsEmail()
  @MaxLength(120)
  @ApiProperty({
    type: String,
    format: 'email',
    maxLength: 120,
    example: 'ficticio@example.test',
  })
  correo: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  direccion?: string;
}

export class SearchPatientsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @ApiProperty({
    type: String,
    minLength: 2,
    maxLength: 100,
    description:
      'Documento, nombres o apellidos; se eliminan espacios en los extremos.',
    example: 'Prueba',
  })
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
    required: false,
  })
  limit = 20;
}
