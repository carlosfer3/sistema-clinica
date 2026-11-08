import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/auth.decorators.js';

@ApiTags('General')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Saludo de la API',
    description: 'Público. No comprueba la conexión a PostgreSQL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Saludo de ejemplo.',
    content: {
      'text/html': { schema: { type: 'string', example: 'Hello World!' } },
    },
  })
  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}
