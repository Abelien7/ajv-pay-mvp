import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export type AuditActorType = 'merchant' | 'system' | 'provider' | 'admin';

export interface AuditLogEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Journal d'audit append-only (voir migrations/004_audit_logs.sql).
 *
 * Toujours best-effort et hors transaction métier : un audit log raté ne
 * doit jamais faire échouer une opération de paiement (contrairement au
 * ledger, qui DOIT être dans la même transaction que la transition de
 * statut). On logge l'échec mais on ne propage jamais l'erreur.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly db: DatabaseService) {}

  async record(entry: AuditLogEntry, client?: PoolClient): Promise<void> {
    const sql = `
      INSERT INTO audit_logs (actor_type, actor_id, action, resource_type, resource_id, ip_address, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const params = [
      entry.actorType,
      entry.actorId ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.ipAddress ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ];

    try {
      if (client) {
        await client.query(sql, params);
      } else {
        await this.db.query(sql, params);
      }
    } catch (err: any) {
      this.logger.error(`Échec d'écriture audit_logs (action=${entry.action}): ${err.message}`);
    }
  }
}
