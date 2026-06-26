import { Module } from '@nestjs/common';
import { PaymentEventsService } from './payment-events.service';

@Module({
  providers: [PaymentEventsService],
  exports: [PaymentEventsService],
})
export class EventsModule {}
