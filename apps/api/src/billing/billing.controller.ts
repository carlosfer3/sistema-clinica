import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { ArrivalParamsDto } from '../agenda/arrival-params.dto.js';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';
import { SearchPatientsDto } from '../patients/patient.dto.js';
import { BillingService } from './billing.service.js';
import {
  ChargesQueryDto,
  CreateChargeDto,
  SettleChargeDto,
} from './billing.dto.js';

@ApiTags('Caja y pagos')
@Controller('billing')
@Roles('cajero')
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('patients')
  @ApiContract('Buscar paciente para caja', 'BillingPatient', { array: true })
  search(
    @Query() query: SearchPatientsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.search(query.q, req.user!.id, ip);
  }
  @Get('charges')
  @ApiContract('Listar cobros para caja', 'Charges')
  list(
    @Query() query: ChargesQueryDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.list(query, req.user!.id, ip);
  }
  @Post('charges')
  @ApiContract('Registrar cobro pendiente', 'Charge', { status: 201 })
  @ApiBody({ type: CreateChargeDto })
  create(
    @Body() dto: CreateChargeDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.create(dto, req.user!.id, ip);
  }
  @Post('charges/:id/settle')
  @HttpCode(200)
  @ApiContract('Registrar pago recibido en caja', 'Charge', {
    description:
      'Solo caja. Verificar el pago recibido antes de confirmar. No realiza un cobro en línea.',
    errors: {
      400: 'Método o referencia inválidos.',
      404: 'Cobro inexistente.',
      409: 'Pago ya registrado con otros datos.',
    },
  })
  @ApiBody({ type: SettleChargeDto })
  settle(
    @Param() params: ArrivalParamsDto,
    @Body() dto: SettleChargeDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.settle(params.id, dto, req.user!.id, ip);
  }
}

@ApiTags('Portal del paciente')
@Controller('portal/payments')
@Roles('paciente')
export class PatientPaymentsController {
  constructor(private readonly billing: BillingService) {}
  @Get()
  @ApiContract('Consultar mis pagos y saldo pendiente', 'PatientPayments')
  own(
    @Query() query: NursingQueueDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.own(query, req.user!.id, ip);
  }
  @Get(':id/receipt')
  @ApiContract('Consultar mi constancia interna de pago', 'ChargeReceipt', {
    errors: { 404: 'Cobro no pagado o ajeno al paciente.' },
  })
  receipt(
    @Param() params: ArrivalParamsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.billing.receipt(params.id, req.user!.id, ip);
  }
}
