import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Résolu par SessionGuard — id de la ligne merchant_users, distinct de merchant.id. */
export const CurrentMerchantUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return req.merchantUserId;
  },
);
