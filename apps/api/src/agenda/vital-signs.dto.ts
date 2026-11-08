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
  temperaturaC: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  presionSistolica: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  presionDiastolica: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  frecuenciaCardiaca: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  frecuenciaRespiratoria: number;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  saturacionOxigeno: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(2000)
  pesoKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(400)
  tallaCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
