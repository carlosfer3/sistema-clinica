import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './configure-app.js';
import { setupOpenApi } from './openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  configureApp(app);
  setupOpenApi(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}/api`);
}
await bootstrap();
