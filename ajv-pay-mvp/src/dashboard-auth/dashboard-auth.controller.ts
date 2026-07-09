import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { DashboardAuthService, SESSION_DURATION_MS } from './dashboard-auth.service';
import { LoginDto } from './dto/login.dto';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie.constants';

@ApiExcludeController() // login/logout du dashboard humain, pas une API d'intégration tierce
@Controller('dashboard')
export class DashboardAuthController {
  constructor(private readonly auth: DashboardAuthService) {}

  /**
   * Limite de débit dédiée, plus stricte que le throttler global (100/min,
   * voir app.module.ts) — cette route est une cible naturelle de devinette
   * de mot de passe. `LOGIN_THROTTLE_LIMIT` n'existe QUE pour la suite
   * e2e (.env.test) : de nombreux tests se connectent à la suite depuis la
   * même IP dans la même minute, ce qui épuiserait sinon une vraie limite
   * de sécurité en quelques tests — la valeur par défaut (5) est celle
   * réellement appliquée en production.
   */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5), ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { sessionToken, merchant } = await this.auth.login(dto.email, dto.password);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(SESSION_DURATION_MS));
    return { id: merchant.id, name: merchant.name };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await this.auth.logout(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { status: 'ok' };
  }
}
