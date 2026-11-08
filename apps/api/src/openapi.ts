import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { responseSchemas } from './openapi/schemas.js';

export function setupOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SIGES SR API')
    .setDescription(
      'API de la Clínica San Rafael. Datos ficticios de ejemplo. Campos de entrada no declarados se rechazan con 400. Las fechas operativas usan America/Lima; los instantes se devuelven en UTC. Iniciar sesión y pegar accessToken en Authorize. Los roles permitidos aparecen en x-roles. La auditoría es obligatoria en operaciones protegidas.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Token de POST /api/auth/login. Expira en una hora; cuenta activa y rol se verifican en cada petición.',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...responseSchemas,
  };
  // Match ValidationPipe: request DTOs reject non-whitelisted properties.
  for (const name of [
    'LoginDto',
    'CreatePatientDto',
    'SearchPatientsDto',
    'CreateAppointmentDto',
    'AvailabilityDto',
    'ArrivalParamsDto',
    'NursingQueueDto',
    'VitalSignsDto',
  ]) {
    const schema = document.components.schemas[name];
    if (schema && !('$ref' in schema)) schema.additionalProperties = false;
  }
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: '/api/openapi.json',
    yamlDocumentUrl: '/api/openapi.yaml',
    customSiteTitle: 'SIGES SR · API',
    swaggerOptions: {
      persistAuthorization: false,
      showExtensions: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
  return document;
}
