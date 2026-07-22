import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateNewsPostDto, UpdateNewsPostDto } from './dto/news-post.dto';
import { CreateListItemDto, UpdateListItemDto } from './dto/list-item.dto';
import { CreateCardFeatureDto, UpdateCardFeatureDto } from './dto/card-feature.dto';

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  is_published: boolean;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ListItem {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  created_at: Date;
}

export interface CardFeature {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

type ListTable = 'covered_countries' | 'payment_networks';

/**
 * Contenu du site vitrine géré par le superadmin (même clé que la revue des
 * paiements manuels, voir AdminApiKeyGuard) — actualités, pays couverts,
 * réseaux de paiement. `covered_countries` et `payment_networks` partagent
 * exactement la même forme (nom + actif + ordre d'affichage), d'où les
 * méthodes génériques ci-dessous ; `news_posts` a une forme différente
 * (titre/contenu/image/publication) et garde ses propres méthodes.
 */
@Injectable()
export class SiteContentService {
  constructor(private readonly db: DatabaseService) {}

  // ---------- Lecture publique (site vitrine, sans authentification) ----------

  async listPublishedNews(): Promise<NewsPost[]> {
    const { rows } = await this.db.query<NewsPost>(
      `SELECT * FROM news_posts WHERE is_published = TRUE ORDER BY published_at DESC`,
    );
    return rows;
  }

  listActiveCountries(): Promise<ListItem[]> {
    return this.listActive('covered_countries');
  }

  listActiveNetworks(): Promise<ListItem[]> {
    return this.listActive('payment_networks');
  }

  async listActiveCardFeatures(): Promise<CardFeature[]> {
    const { rows } = await this.db.query<CardFeature>(
      `SELECT * FROM ajv_card_features WHERE is_active = TRUE ORDER BY display_order ASC, created_at ASC`,
    );
    return rows;
  }

  private async listActive(table: ListTable): Promise<ListItem[]> {
    const { rows } = await this.db.query<ListItem>(
      `SELECT * FROM ${table} WHERE is_active = TRUE ORDER BY display_order ASC, created_at ASC`,
    );
    return rows;
  }

  // ---------- Administration (superadmin, AdminApiKeyGuard) ----------

  async listAllNews(): Promise<NewsPost[]> {
    const { rows } = await this.db.query<NewsPost>(`SELECT * FROM news_posts ORDER BY created_at DESC`);
    return rows;
  }

  async createNews(dto: CreateNewsPostDto): Promise<NewsPost> {
    const isPublished = dto.isPublished ?? false;
    const { rows } = await this.db.query<NewsPost>(
      `INSERT INTO news_posts (title, body, image_url, is_published, published_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [dto.title, dto.body, dto.imageUrl ?? null, isPublished, isPublished ? new Date() : null],
    );
    return rows[0];
  }

  async updateNews(id: string, dto: UpdateNewsPostDto): Promise<NewsPost> {
    const existing = await this.getNewsById(id);
    const isPublished = dto.isPublished ?? existing.is_published;
    // Une actualité qui passe de brouillon à publié pour la première fois reçoit sa date de publication maintenant.
    const publishedAt = isPublished && !existing.is_published ? new Date() : existing.published_at;

    const { rows } = await this.db.query<NewsPost>(
      `UPDATE news_posts SET title = $2, body = $3, image_url = $4, is_published = $5, published_at = $6
       WHERE id = $1 RETURNING *`,
      [
        id,
        dto.title ?? existing.title,
        dto.body ?? existing.body,
        dto.imageUrl ?? existing.image_url,
        isPublished,
        publishedAt,
      ],
    );
    return rows[0];
  }

  async deleteNews(id: string): Promise<void> {
    await this.getNewsById(id);
    await this.db.query(`DELETE FROM news_posts WHERE id = $1`, [id]);
  }

  private async getNewsById(id: string): Promise<NewsPost> {
    const { rows } = await this.db.query<NewsPost>(`SELECT * FROM news_posts WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException(`Actualité ${id} introuvable.`);
    return rows[0];
  }

  async listAllCountries(): Promise<ListItem[]> {
    return this.listAll('covered_countries');
  }
  async createCountry(dto: CreateListItemDto): Promise<ListItem> {
    return this.createListItem('covered_countries', dto);
  }
  async updateCountry(id: string, dto: UpdateListItemDto): Promise<ListItem> {
    return this.updateListItem('covered_countries', id, dto);
  }
  async deleteCountry(id: string): Promise<void> {
    return this.deleteListItem('covered_countries', id);
  }

  async listAllNetworks(): Promise<ListItem[]> {
    return this.listAll('payment_networks');
  }
  async createNetwork(dto: CreateListItemDto): Promise<ListItem> {
    return this.createListItem('payment_networks', dto);
  }
  async updateNetwork(id: string, dto: UpdateListItemDto): Promise<ListItem> {
    return this.updateListItem('payment_networks', id, dto);
  }
  async deleteNetwork(id: string): Promise<void> {
    return this.deleteListItem('payment_networks', id);
  }

  async listAllCardFeatures(): Promise<CardFeature[]> {
    const { rows } = await this.db.query<CardFeature>(
      `SELECT * FROM ajv_card_features ORDER BY display_order ASC, created_at ASC`,
    );
    return rows;
  }

  async createCardFeature(dto: CreateCardFeatureDto): Promise<CardFeature> {
    const { rows } = await this.db.query<CardFeature>(
      `INSERT INTO ajv_card_features (title, body, is_active, display_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [dto.title, dto.body, dto.isActive ?? true, dto.displayOrder ?? 0],
    );
    return rows[0];
  }

  async updateCardFeature(id: string, dto: UpdateCardFeatureDto): Promise<CardFeature> {
    const existing = await this.getCardFeatureById(id);
    const { rows } = await this.db.query<CardFeature>(
      `UPDATE ajv_card_features SET title = $2, body = $3, is_active = $4, display_order = $5 WHERE id = $1 RETURNING *`,
      [
        id,
        dto.title ?? existing.title,
        dto.body ?? existing.body,
        dto.isActive ?? existing.is_active,
        dto.displayOrder ?? existing.display_order,
      ],
    );
    return rows[0];
  }

  async deleteCardFeature(id: string): Promise<void> {
    await this.getCardFeatureById(id);
    await this.db.query(`DELETE FROM ajv_card_features WHERE id = $1`, [id]);
  }

  private async getCardFeatureById(id: string): Promise<CardFeature> {
    const { rows } = await this.db.query<CardFeature>(`SELECT * FROM ajv_card_features WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException(`Élément ${id} introuvable dans ajv_card_features.`);
    return rows[0];
  }

  private async listAll(table: ListTable): Promise<ListItem[]> {
    const { rows } = await this.db.query<ListItem>(
      `SELECT * FROM ${table} ORDER BY display_order ASC, created_at ASC`,
    );
    return rows;
  }

  private async createListItem(table: ListTable, dto: CreateListItemDto): Promise<ListItem> {
    const { rows } = await this.db.query<ListItem>(
      `INSERT INTO ${table} (name, is_active, display_order) VALUES ($1, $2, $3) RETURNING *`,
      [dto.name, dto.isActive ?? true, dto.displayOrder ?? 0],
    );
    return rows[0];
  }

  private async updateListItem(table: ListTable, id: string, dto: UpdateListItemDto): Promise<ListItem> {
    const existing = await this.getListItemById(table, id);
    const { rows } = await this.db.query<ListItem>(
      `UPDATE ${table} SET name = $2, is_active = $3, display_order = $4 WHERE id = $1 RETURNING *`,
      [
        id,
        dto.name ?? existing.name,
        dto.isActive ?? existing.is_active,
        dto.displayOrder ?? existing.display_order,
      ],
    );
    return rows[0];
  }

  private async deleteListItem(table: ListTable, id: string): Promise<void> {
    await this.getListItemById(table, id);
    await this.db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }

  private async getListItemById(table: ListTable, id: string): Promise<ListItem> {
    const { rows } = await this.db.query<ListItem>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException(`Élément ${id} introuvable dans ${table}.`);
    return rows[0];
  }
}
