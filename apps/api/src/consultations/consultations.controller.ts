import {
  Body,
  HttpCode,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { ArrivalParamsDto } from '../agenda/arrival-params.dto.js';
import {
  CreateConsultationDto,
  DiagnosisSearchDto,
  AnnulConsultationDto,
} from './consultation.dto.js';
import { ConsultationsService } from './consultations.service.js';

@ApiTags('Consultas y recetas')
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get()
  @Roles('medico')
  @ApiContract('Consultar últimas 50 consultas propias', 'Consultation', { array: true })
  list(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.consultations.list(req.user!.id, ip);
  }

  @Post(':id/annul')
  @HttpCode(200)
  @Roles('medico')
  @ApiBody({ type: AnnulConsultationDto })
  @ApiParam({ name: 'id', type: Number })
  @ApiContract('Anular consulta propia conservando evidencia', 'Consultation', { errors: { 400: 'Motivo o ID inválido.', 404: 'Consulta no accesible.', 409: 'Consulta ya anulada.' } })
  annul(@Param() params: ArrivalParamsDto, @Body() dto: AnnulConsultationDto, @Req() req: AuthRequest, @Ip() ip: string) {
    return this.consultations.annul(params.id, dto.motivo, req.user!.id, ip);
  }

  @ApiContract('Consultar catálogo CIE-10', 'DiagnosisCode', {
    array: true,
    description:
      'Solo médico. Código o descripción; hasta 50 resultados. No es un catálogo de medicamentos. Requiere cargar previamente el catálogo.',
    errors: { 400: 'Filtro inválido o desconocido.' },
  })
  @Get('diagnoses')
  @Roles('medico')
  diagnoses(
    @Query() query: DiagnosisSearchDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.consultations.diagnoses(query, req.user!.id, ip);
  }

  @ApiContract('Registrar consulta y receta manual opcional', 'Consultation', {
    status: 201,
    description:
      'Solo médico asignado. Cita presencial de hoy en Lima, llegada registrada y evaluación previa completada. Un diagnóstico principal (primero) y secundarios opcionales; códigos existentes en catálogo. Receta manual opcional, un elemento por medicamento. Autor, paciente y fecha se determinan en servidor. La transacción guarda consulta, diagnósticos, receta, cita atendida y auditoría. No admite sobrescritura ni consultas sin cita en este incremento.',
    errors: {
      400: 'Datos inválidos, campos desconocidos, código no catalogado o cita de otro día.',
      404: 'Cita no accesible para este médico.',
      409: 'Cita no preparada, ya atendida/cancelada o con consulta existente.',
    },
  })
  @ApiBody({ type: CreateConsultationDto })
  @Post()
  @Roles('medico')
  create(
    @Body() dto: CreateConsultationDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.consultations.create(dto, req.user!.id, ip);
  }

  @ApiContract('Consultar episodio y receta', 'Consultation', {
    description:
      'Solo el médico autor de la consulta. Devuelve diagnósticos y receta ordenados, incluidos episodios anulados sin perder evidencia. No es todavía la HCE cronológica unificada de HU03.',
    errors: {
      400: 'ID inválido.',
      404: 'Consulta no accesible para este médico.',
    },
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
    description: 'ID de la consulta.',
    example: 1,
  })
  @Get(':id')
  @Roles('medico')
  findOne(
    @Param() params: ArrivalParamsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.consultations.findOne(params.id, req.user!.id, ip);
  }
}
