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
