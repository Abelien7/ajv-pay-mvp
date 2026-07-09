import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SiteContentService } from './site-content.service';

/**
 * Contenu public du site vitrine — pas d'authentification, appelé
 * directement par la page Landing. Ne renvoie que le publié/actif.
 */
@ApiTags('site-content')
@Controller('site-content')
export class SiteContentPublicController {
  constructor(private readonly siteContent: SiteContentService) {}

  @Get('news')
  listNews() {
    return this.siteContent.listPublishedNews();
  }

  @Get('countries')
  listCountries() {
    return this.siteContent.listActiveCountries();
  }

  @Get('networks')
  listNetworks() {
    return this.siteContent.listActiveNetworks();
  }
}
