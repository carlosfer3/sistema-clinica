import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DiagnosisDto {
  @IsString()
  @Matches(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/)
  @ApiProperty({
    type: String,
    pattern: '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$',
    example: 'J00',
    description:
      'Código exacto existente en el catálogo CIE-10. El primer diagnóstico es principal.',
  })
  codigo: string;
}

export class PrescriptionItemDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  @ApiProperty({
    type: String,
    maxLength: 150,
    example: 'Medicamento ficticio',
    description: 'Nombre escrito manualmente; sin catálogo de medicamentos.',
  })
  medicamento: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiProperty({
    type: String,
    maxLength: 100,
    description: 'Dosis indicada por el médico, con su unidad.',
  })
  dosis: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  @ApiProperty({
    type: String,
    maxLength: 80,
    description: 'Vía de administración escrita por el médico.',
  })
  via: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiProperty({
    type: String,
    maxLength: 100,
    description: 'Frecuencia de administración en texto.',
  })
  frecuencia: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiProperty({
    type: String,
    maxLength: 100,
    description: 'Duración del tratamiento, con unidad, en texto.',
  })
  duracion: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  indicaciones?: string;
}

export class CreateConsultationDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647, example: 1 })
  citaId: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  @ApiProperty({
    type: String,
    maxLength: 300,
    example: 'Motivo de consulta ficticio',
  })
  motivo: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  @ApiProperty({
    type: String,
    maxLength: 5000,
    description: 'Indicaciones generales de la consulta.',
  })
  indicaciones: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique((diagnosis: DiagnosisDto) => diagnosis?.codigo)
  @ValidateNested({ each: true })
  @Type(() => DiagnosisDto)
  @ApiProperty({
    type: () => [DiagnosisDto],
    minItems: 1,
    maxItems: 20,
    description:
      'Sin códigos repetidos. El primero se guarda como principal, los demás como secundarios.',
  })
  diagnosticos: DiagnosisDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  @ApiPropertyOptional({
    type: () => [PrescriptionItemDto],
    maxItems: 30,
    nullable: true,
    description: 'Omitir o enviar [] para consulta sin receta.',
  })
  receta?: PrescriptionItemDto[];
}

export class DiagnosisSearchDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @ApiPropertyOptional({
    type: String,
    minLength: 2,
    maxLength: 100,
    description: 'Código o descripción; sin filtro devuelve hasta 50 entradas.',
    example: 'J00',
  })
  q?: string;
}
