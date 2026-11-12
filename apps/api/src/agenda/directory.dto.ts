import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { NursingQueueDto } from './nursing-queue.dto.js';

export class DirectoryDto extends NursingQueueDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 32767 })
  especialidadId?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 100 })
  buscar?: string;
}
