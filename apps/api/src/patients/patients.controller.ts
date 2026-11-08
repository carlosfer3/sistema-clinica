import { ApiBody, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { ref } from '../openapi/schemas.js';
import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { CreatePatientDto, SearchPatientsDto } from './patient.dto.js';
import { PatientsService } from './patients.service.js';

@ApiTags('Pacientes')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @ApiContract('Registrar paciente', 'Patient', {
    status: 201,
    description:
      'Solo admisión. Datos demográficos y de contacto; sin cuenta de portal. Se rechazan antecedentes, alergias y cualquier campo clínico.',
    errors: {
      400: 'Datos inválidos, DNI distinto de 8 dígitos, nacimiento futuro o campos no permitidos.',
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Documento duplicado; identifica al paciente existente.',
    schema: ref('DuplicatePatient'),
  })
  @ApiBody({ type: CreatePatientDto })
  @Post()
  @Roles('admision')
  create(
    @Body() dto: CreatePatientDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.create(dto, req.user!.id, ip);
  }

  @ApiContract('Buscar paciente por DNI', 'Patient', {
    array: true,
    description:
      'Admisión, médico y enfermería. Busca únicamente por DNI completo de 8 dígitos y coincidencia exacta; devuelve cero o un paciente. Solo datos demográficos y de contacto, sin información clínica.',
    errors: { 400: 'Consulta inválida o campos desconocidos.' },
  })
  @Get()
  @Roles('admision', 'medico', 'enfermeria')
  search(
    @Query() dto: SearchPatientsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.search(dto, req.user!.id, ip);
  }

  @ApiContract('Consultar ficha demográfica', 'Patient', {
    description:
      'Admisión, médico y enfermería. No contiene información clínica.',
    errors: { 400: 'ID no entero.', 404: 'Paciente inexistente.' },
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del paciente.',
    example: 1,
  })
  @Get(':id')
  @Roles('admision', 'medico', 'enfermeria')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.findOne(id, req.user!.id, ip);
  }

  @ApiContract('Consultar perfil clínico', 'ClinicalProfile', {
    description:
      'Solo médico. Ficha con antecedentes y alergias; todavía no es la HCE cronológica. Enfermería y admisión no tienen acceso.',
    errors: { 400: 'ID no entero.', 404: 'Paciente inexistente.' },
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del paciente.',
    example: 1,
  })
  @Get(':id/clinical-profile')
  @Roles('medico')
  clinicalProfile(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.patients.clinicalProfile(id, req.user!.id, ip);
  }
}
