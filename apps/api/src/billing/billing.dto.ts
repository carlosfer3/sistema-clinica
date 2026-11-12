import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';

export class ChargesQueryDto extends NursingQueueDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  pacienteId?: number;
}
export class CreateChargeDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({ minimum: 1 })
  pacienteId: number;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  @ApiProperty({ maxLength: 160 })
  concepto: string;
  @IsInt()
  @Min(1)
  @Max(100000000)
  @ApiProperty({
    minimum: 1,
    maximum: 100000000,
    description:
      'Importe en céntimos de PEN. No se aceptan importes calculados por el paciente.',
  })
  montoCentimos: number;
}
export class SettleChargeDto {
  @IsIn(['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'])
  @ApiProperty({
    enum: ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'],
  })
  metodoPago: string;
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Obligatoria salvo efectivo. Referencia de la operación verificada por caja.',
  })
  referencia?: string;
}
