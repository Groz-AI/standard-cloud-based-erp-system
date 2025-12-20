import { query } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { TenantContext, AuditLog } from '../types/index.js';

export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId?: string;
  storeId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit Service
 * 
 * Provides append-only audit logging for all sensitive operations.
 * Every action that modifies data should be logged here.
 */
export class AuditService {
  /**
   * Log an audit event
   */
  static async log(
    ctx: TenantContext,
    input: AuditLogInput
  ): Promise<AuditLog> {
    const id = uuidv4();
    
    const result = await query<AuditLog>(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, action, entity_type, entity_id,
        store_id, before_data, after_data, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        ctx.tenantId,
        ctx.userId,
        input.action,
        input.entityType,
        input.entityId,
        input.storeId || ctx.storeId,
        input.beforeData ? JSON.stringify(input.beforeData) : null,
        input.afterData ? JSON.stringify(input.afterData) : null,
        input.ipAddress,
        input.userAgent
      ]
    );

    return result.rows[0];
  }

  /**
   * Get audit logs with filtering
   */
  static async getAuditLogs(
    tenantId: string,
    options: {
      userId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      storeId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(options.userId);
    }

    if (options.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(options.action);
    }

    if (options.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(options.entityType);
    }

    if (options.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(options.entityId);
    }

    if (options.storeId) {
      conditions.push(`store_id = $${paramIndex++}`);
      params.push(options.storeId);
    }

    if (options.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`,
      params
    );

    // Get logs
    const logsResult = await query<AuditLog>(
      `SELECT al.*, u.first_name, u.last_name, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      logs: logsResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get recent activity for an entity
   */
  static async getEntityHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit: number = 20
  ): Promise<AuditLog[]> {
    const result = await query<AuditLog>(
      `SELECT al.*, u.first_name, u.last_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.tenant_id = $1 AND al.entity_type = $2 AND al.entity_id = $3
       ORDER BY al.created_at DESC
       LIMIT $4`,
      [tenantId, entityType, entityId, limit]
    );

    return result.rows;
  }

  /**
   * Common audit actions
   */
  static readonly ACTIONS = {
    // Auth
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',
    
    // CRUD
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    
    // POS
    SALE_COMPLETED: 'SALE_COMPLETED',
    SALE_VOIDED: 'SALE_VOIDED',
    REFUND_ISSUED: 'REFUND_ISSUED',
    DISCOUNT_APPLIED: 'DISCOUNT_APPLIED',
    SALE_PARKED: 'SALE_PARKED',
    SALE_RECALLED: 'SALE_RECALLED',
    
    // Shift
    SHIFT_OPENED: 'SHIFT_OPENED',
    SHIFT_CLOSED: 'SHIFT_CLOSED',
    CASH_IN: 'CASH_IN',
    CASH_OUT: 'CASH_OUT',
    
    // Inventory
    GRN_RECEIVED: 'GRN_RECEIVED',
    ADJUSTMENT_POSTED: 'ADJUSTMENT_POSTED',
    TRANSFER_DISPATCHED: 'TRANSFER_DISPATCHED',
    TRANSFER_RECEIVED: 'TRANSFER_RECEIVED',
    STOCK_COUNT_POSTED: 'STOCK_COUNT_POSTED',
    
    // Pricing
    PRICE_UPDATED: 'PRICE_UPDATED',
    PROMO_CREATED: 'PROMO_CREATED',
    PROMO_ENDED: 'PROMO_ENDED',
    
    // Admin
    USER_CREATED: 'USER_CREATED',
    USER_DEACTIVATED: 'USER_DEACTIVATED',
    ROLE_ASSIGNED: 'ROLE_ASSIGNED',
    ROLE_REVOKED: 'ROLE_REVOKED',
  } as const;
}

export default AuditService;
