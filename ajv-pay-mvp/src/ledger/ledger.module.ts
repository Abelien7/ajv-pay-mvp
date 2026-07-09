import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LedgerService } from './ledger.service';

@Module({
  imports: [ConfigModule],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
