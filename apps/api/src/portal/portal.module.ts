import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [AgendaModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
