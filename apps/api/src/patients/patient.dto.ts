import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

export class AntecedenteDto {
  @IsIn(['personal', 'familiar', 'quirurgico', 'cronica'])
  tipo: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  descripcion: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  desde?: string;
}

export class AlergiaDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  sustancia: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reaccion?: string;
}

export class CreatePatientDto {
  @IsIn(['DNI', 'CE', 'PASAPORTE'])
  tipoDocumento: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{1,15}$/)
  numeroDocumento: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  nombres: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  apellidos: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fechaNacimiento: string;

  @IsIn(['M', 'F'])
  sexo: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,20}$/)
  telefono: string;

  @IsEmail()
  @MaxLength(120)
  correo: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AntecedenteDto)
  antecedentes?: AntecedenteDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AlergiaDto)
  alergias?: AlergiaDto[];
}

export class SearchPatientsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
