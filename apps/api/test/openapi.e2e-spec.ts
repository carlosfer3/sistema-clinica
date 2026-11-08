import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { setupOpenApi } from '../src/openapi.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('OpenAPI contract and Swagger UI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const databaseAccess = vi.fn();
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: databaseAccess },
        bitacoraAuditoria: { create: databaseAccess },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    document = setupOpenApi(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  const endpoints = [
    ['get', '/api'],
    ['post', '/api/auth/login'],
    ['get', '/api/auth/me'],
    ['get', '/api/patients'],
    ['post', '/api/patients'],
    ['get', '/api/patients/{id}'],
    ['get', '/api/patients/{id}/clinical-profile'],
    ['get', '/api/agenda/catalog'],
    ['get', '/api/agenda/availability'],
    ['post', '/api/agenda/appointments'],
    ['get', '/api/agenda/appointments'],
    ['post', '/api/agenda/appointments/{id}/arrival'],
    ['get', '/api/agenda/nursing-queue'],
    ['post', '/api/agenda/appointments/{id}/vital-signs'],
    ['get', '/api/agenda/appointments/{id}/vital-signs'],
  ];
  function operation(method: string, path: string) {
    return document.paths[path][method as 'get' | 'post'] as OperationObject;
  }
  it('documents every current endpoint with a summary, tag and response schema', () => {
    const documented = Object.values(document.paths).flatMap((path) =>
      ['get', 'post', 'put', 'patch', 'delete'].filter(
        (method) => method in path,
      ),
    );
    expect(documented).toHaveLength(endpoints.length);
    for (const [method, path] of endpoints) {
      const op = operation(method, path);
      expect(op.summary).toBeTruthy();
      expect(op.tags?.length).toBeGreaterThan(0);
      const response =
        op.responses[
          method === 'post' &&
          !path.endsWith('/login') &&
          !path.endsWith('/arrival')
            ? '201'
            : '200'
        ];
      expect(response).toHaveProperty('content');
    }
  });
  it('declares Bearer security and roles only on protected operations', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    for (const [method, path] of endpoints) {
      const op = operation(method, path);
      if (path === '/api' || path === '/api/auth/login')
        expect(op.security ?? []).toEqual([]);
      else {
        expect(op.security).toEqual([{ bearer: [] }]);
        expect(op).toHaveProperty('x-roles');
        expect(op.responses).toHaveProperty('401');
        expect(op.responses).toHaveProperty('403');
      }
    }
    expect(
      operation('get', '/api/patients/{id}/clinical-profile'),
    ).toHaveProperty('x-roles', ['medico']);
    expect(
      operation('post', '/api/agenda/appointments/{id}/vital-signs'),
    ).toHaveProperty('x-roles', ['enfermeria']);
    expect(
      operation('post', '/api/agenda/appointments/{id}/arrival'),
    ).toHaveProperty('x-roles', ['admision']);
  });
  it('includes DTO properties, required fields, query parameters and business errors', () => {
    const schemas = document.components!.schemas!;
    expect(schemas.CreatePatientDto).toHaveProperty(
      'required',
      expect.arrayContaining(['tipoDocumento', 'numeroDocumento', 'correo']),
    );
    expect(schemas.CreatePatientDto).not.toHaveProperty(
      'properties.antecedentes',
    );
    expect(schemas.CreatePatientDto).not.toHaveProperty('properties.alergias');
    expect(schemas.VitalSignsDto).toHaveProperty(
      'properties.temperaturaC.example',
      36.5,
    );
    expect(schemas.VitalSignsDto).not.toHaveProperty(
      'properties.registradoPor',
    );
    const availability = operation('get', '/api/agenda/availability');
    expect(availability.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fecha', in: 'query', required: true }),
        expect.objectContaining({
          name: 'medicoId',
          in: 'query',
          required: false,
        }),
      ]),
    );
    expect(
      operation('post', '/api/agenda/appointments').responses,
    ).toHaveProperty('409');
    expect(
      operation('get', '/api/agenda/appointments/{id}/vital-signs').responses,
    ).toHaveProperty('404');
  });
  it('resolves all schema references and contains no password hash or token example', () => {
    const refs = JSON.stringify(document).matchAll(
      /"\$ref":"#\/components\/schemas\/([^"/]+)"/g,
    );
    for (const match of refs)
      expect(document.components?.schemas).toHaveProperty(match[1]);
    expect(JSON.stringify(document)).not.toContain('passwordHash');
    expect(JSON.stringify(document)).not.toContain('eyJ');
  });
  it('serves the UI, JSON and YAML without database access or a token', async () => {
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    const json = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    expect(json.body.paths).toHaveProperty('/api/agenda/nursing-queue');
    await request(app.getHttpServer()).get('/api/openapi.yaml').expect(200);
    expect(databaseAccess).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get('/api/patients?q=Prueba')
      .expect(401);
  });
});
