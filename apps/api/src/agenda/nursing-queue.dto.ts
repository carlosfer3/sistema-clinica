import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class NursingQueueDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 50;
}
