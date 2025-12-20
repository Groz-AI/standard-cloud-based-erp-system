import { query } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';

export interface QueuedEvent {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}

/**
 * Event Service
 * 
 * Queues business events for BigQuery synchronization.
 * Events are stored in a local queue table and processed asynchronously.
 */
export class EventService {
  /**
   * Queue an event for BigQuery sync
   */
  static async queueEvent(
    tenantId: string,
    event: QueuedEvent
  ): Promise<string> {
    const id = uuidv4();
    
    await query(
      `INSERT INTO event_queue (
        id, tenant_id, event_type, entity_type, entity_id, payload
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        tenantId,
        event.eventType,
        event.entityType,
        event.entityId,
        JSON.stringify(event.payload)
      ]
    );

    return id;
  }

  /**
   * Queue multiple events
   */
  static async queueEvents(
    tenantId: string,
    events: QueuedEvent[]
  ): Promise<string[]> {
    const ids: string[] = [];
    
    for (const event of events) {
      const id = await this.queueEvent(tenantId, event);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get pending events for processing
   */
  static async getPendingEvents(
    limit: number = 100
  ): Promise<Array<QueuedEvent & { id: string; tenantId: string; createdAt: Date }>> {
    const result = await query<QueuedEvent & { id: string; tenant_id: string; created_at: Date }>(
      `UPDATE event_queue 
       SET status = 'processing'
       WHERE id IN (
         SELECT id FROM event_queue 
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload,
      createdAt: row.created_at
    }));
  }

  /**
   * Mark events as completed
   */
  static async markCompleted(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;

    await query(
      `UPDATE event_queue 
       SET status = 'completed', processed_at = NOW()
       WHERE id = ANY($1)`,
      [eventIds]
    );
  }

  /**
   * Mark events as failed
   */
  static async markFailed(
    eventIds: string[],
    errorMessage: string
  ): Promise<void> {
    if (eventIds.length === 0) return;

    await query(
      `UPDATE event_queue 
       SET status = 'failed', 
           error_message = $2,
           retry_count = retry_count + 1
       WHERE id = ANY($1)`,
      [eventIds, errorMessage]
    );
  }

  /**
   * Retry failed events
   */
  static async retryFailedEvents(maxRetries: number = 3): Promise<number> {
    const result = await query(
      `UPDATE event_queue 
       SET status = 'pending'
       WHERE status = 'failed' AND retry_count < $1`,
      [maxRetries]
    );

    return result.rowCount || 0;
  }

  /**
   * Clean up old completed events
   */
  static async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM event_queue 
       WHERE status = 'completed' 
       AND processed_at < NOW() - INTERVAL '1 day' * $1`,
      [daysToKeep]
    );

    return result.rowCount || 0;
  }

  /**
   * Get event queue stats
   */
  static async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const result = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count 
       FROM event_queue 
       GROUP BY status`
    );

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    for (const row of result.rows) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = parseInt(row.count);
      }
    }

    return stats;
  }

  // Common event types
  static readonly EVENT_TYPES = {
    SALE_COMPLETED: 'sale_completed',
    RECEIPT_REFUNDED: 'receipt_refunded',
    GRN_RECEIVED: 'grn_received',
    TRANSFER_DISPATCHED: 'transfer_dispatched',
    TRANSFER_RECEIVED: 'transfer_received',
    ADJUSTMENT_POSTED: 'adjustment_posted',
    STOCK_COUNT_POSTED: 'stock_count_posted',
    STOCK_MOVEMENT: 'stock_movement',
    CUSTOMER_CREATED: 'customer_created',
    CUSTOMER_UPDATED: 'customer_updated',
    LOYALTY_EARNED: 'loyalty_earned',
    LOYALTY_REDEEMED: 'loyalty_redeemed',
    PRODUCT_CREATED: 'product_created',
    PRODUCT_UPDATED: 'product_updated',
    PRICE_UPDATED: 'price_updated',
    PROMO_STARTED: 'promo_started',
    PROMO_ENDED: 'promo_ended',
  } as const;
}

export default EventService;
