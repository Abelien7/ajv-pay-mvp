import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PaymentMode } from '../../merchants/merchant.entity';

/** Résolu par ApiKeyGuard selon la clé utilisée — jamais choisi par le marchand dans le corps de la requête. */
export const CurrentPaymentMode = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PaymentMode => {
    const req = ctx.switchToHttp().getRequest();
    return req.paymentMode;
  },
);
