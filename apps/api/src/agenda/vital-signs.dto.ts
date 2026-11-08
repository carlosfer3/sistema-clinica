import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class VitalSignsDto {
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(100)
  @ApiProperty({
    type: Number,
    minimum: 0.1,
    maximum: 100,
    multipleOf: 0.1,
    description: 'Temperatura en °C; límite técnico, no clasificación clínica.',
    example: 36.5,
  })
  temperaturaC: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 1000,
    multipleOf: 1,
    description: 'Presión sistólica, mmHg.',
    example: 120,
  })
  presionSistolica: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 1000,
    multipleOf: 1,
    description: 'Presión diastólica, mmHg.',
    example: 80,
  })
  presionDiastolica: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 1000,
    multipleOf: 1,
    description: 'Latidos/min.',
    example: 75,
  })
  frecuenciaCardiaca: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 1000,
    multipleOf: 1,
    description: 'Respiraciones/min.',
    example: 18,
  })
  frecuenciaRespiratoria: number;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 100,
    multipleOf: 0.1,
    description: 'Saturación de oxígeno, %.',
    example: 98,
  })
  saturacionOxigeno: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(2000)
  @ApiPropertyOptional({
    type: Number,
    minimum: 0.01,
    maximum: 2000,
    multipleOf: 0.01,
    nullable: true,
    description: 'Peso en kg.',
    example: 65.5,
  })
  pesoKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(400)
  @ApiPropertyOptional({
    type: Number,
    minimum: 0.1,
    maximum: 400,
    multipleOf: 0.1,
    nullable: true,
    description: 'Talla en cm.',
    example: 170,
  })
  tallaCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiPropertyOptional({
    type: String,
    maxLength: 1000,
    nullable: true,
    example: 'Observación de enfermería ficticia',
  })
  observaciones?: string;
}
