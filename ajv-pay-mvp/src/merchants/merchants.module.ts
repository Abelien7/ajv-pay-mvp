import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [LedgerModule, AuditModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
