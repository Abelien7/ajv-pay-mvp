import { Module } from '@nestjs/common';
import { SiteContentService } from './site-content.service';
import { SiteContentPublicController } from './site-content-public.controller';
import { AdminSiteContentController } from './admin-site-content.controller';

@Module({
  controllers: [SiteContentPublicController, AdminSiteContentController],
  providers: [SiteContentService],
})
export class SiteContentModule {}
