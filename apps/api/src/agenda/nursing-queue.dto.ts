import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class NursingQueueDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 10000,
    default: 1,
    required: false,
  })
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 50,
    required: false,
  })
  limite = 50;
}
