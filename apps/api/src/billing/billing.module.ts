import { Module } from '@nestjs/common';
import {
  BillingController,
  PatientPaymentsController,
} from './billing.controller.js';
import { BillingService } from './billing.service.js';
@Module({
  controllers: [BillingController, PatientPaymentsController],
  providers: [BillingService],
})
export class BillingModule {}
