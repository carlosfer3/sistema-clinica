import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ref } from './schemas.js';

export function ApiContract(
  summary: string,
  response: string,
  options: {
    status?: number;
    description?: string;
    array?: boolean;
    errors?: Record<number, string>;
  } = {},
) {
  return applyDecorators(
    ApiOperation({ summary, description: options.description }),
    ApiResponse({
      status: options.status ?? 200,
      description: 'Operación exitosa.',
      schema: options.array
        ? { type: 'array', items: ref(response) }
        : ref(response),
    }),
    ...Object.entries({
      500: 'Error interno o auditoría no disponible. No se entrega información protegida si falla su auditoría.',
      ...options.errors,
    }).map(([status, description]) =>
      ApiResponse({
        status: Number(status),
        description,
        schema: ref('Error'),
      }),
    ),
  );
}
