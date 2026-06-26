import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentMerchant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.merchant;
  },
);
