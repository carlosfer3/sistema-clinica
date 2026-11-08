import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ArrivalParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 2147483647,
    example: 1,
    description: 'ID de la cita.',
  })
  id: number;
}
