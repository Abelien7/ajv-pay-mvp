import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../common/auth/admin-api-key.guard';
import { SiteContentService } from './site-content.service';
import { CreateNewsPostDto, UpdateNewsPostDto } from './dto/news-post.dto';
import { CreateListItemDto, UpdateListItemDto } from './dto/list-item.dto';

/**
 * Gestion du contenu du site vitrine par l'admin plateforme (AdminApiKeyGuard) —
 * actualités, pays couverts, réseaux de paiement — sans jamais nécessiter un
 * redéploiement pour refléter un partenariat réellement signé.
 */
@ApiExcludeController() // usage interne admin plateforme, jamais un marchand
@Controller('admin/site-content')
@UseGuards(AdminApiKeyGuard)
export class AdminSiteContentController {
  constructor(private readonly siteContent: SiteContentService) {}

  // ----- Actualités -----

  @Get('news')
  listNews() {
    return this.siteContent.listAllNews();
  }

  @Post('news')
  createNews(@Body() dto: CreateNewsPostDto) {
    return this.siteContent.createNews(dto);
  }

  @Patch('news/:id')
  updateNews(@Param('id') id: string, @Body() dto: UpdateNewsPostDto) {
    return this.siteContent.updateNews(id, dto);
  }

  @Delete('news/:id')
  deleteNews(@Param('id') id: string) {
    return this.siteContent.deleteNews(id);
  }

  // ----- Pays couverts -----

  @Get('countries')
  listCountries() {
    return this.siteContent.listAllCountries();
  }

  @Post('countries')
  createCountry(@Body() dto: CreateListItemDto) {
    return this.siteContent.createCountry(dto);
  }

  @Patch('countries/:id')
  updateCountry(@Param('id') id: string, @Body() dto: UpdateListItemDto) {
    return this.siteContent.updateCountry(id, dto);
  }

  @Delete('countries/:id')
  deleteCountry(@Param('id') id: string) {
    return this.siteContent.deleteCountry(id);
  }

  // ----- Réseaux de paiement -----

  @Get('networks')
  listNetworks() {
    return this.siteContent.listAllNetworks();
  }

  @Post('networks')
  createNetwork(@Body() dto: CreateListItemDto) {
    return this.siteContent.createNetwork(dto);
  }

  @Patch('networks/:id')
  updateNetwork(@Param('id') id: string, @Body() dto: UpdateListItemDto) {
    return this.siteContent.updateNetwork(id, dto);
  }

  @Delete('networks/:id')
  deleteNetwork(@Param('id') id: string) {
    return this.siteContent.deleteNetwork(id);
  }
}
