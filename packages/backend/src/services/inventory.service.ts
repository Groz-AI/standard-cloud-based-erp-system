import { PoolClient } from 'pg';
import { query, withTransaction, getClient } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  TenantContext, 
  StockLedgerEntry, 
  StockOnHand, 
  StockReferenceType 
} from '../types/index.js';
import { EventService } from './event.service.js';

export interface StockMovement {
  productId?: string;
  variantId?: string;
  uomId?: string;
  lotId?: string;
  quantity: number;
  costPrice?: number;
  referenceType: StockReferenceType;
  referenceId: string;
  referenceLineId?: string;
  notes?: string;
}

/**
 * Inventory Service
 * 
 * Handles all stock movements through the ledger.
 * The stock_ledger is the source of truth - stock_on_hand is derived from it.
 */
export class InventoryService {
  /**
   * Record a stock movement in the ledger
   * This is the ONLY way stock should change
   */
  static async recordMovement(
    ctx: TenantContext,
    storeId: string,
    movement: StockMovement,
    client?: PoolClient
  ): Promise<StockLedgerEntry> {
    const executeQuery = client ? client.query.bind(client) : query;
    
    // Get current stock level
    const currentStock = await this.getStockLevel(
      ctx.tenantId,
      storeId,
      movement.productId,
      movement.variantId,
      movement.uomId,
      movement.lotId,
      client
    );

    const quantityBefore = currentStock?.quantity || 0;
    const quantityAfter = quantityBefore + movement.quantity;
    const id = uuidv4();

    // Insert ledger entry
    const ledgerResult = await executeQuery(
      `INSERT INTO stock_ledger (
        id, tenant_id, store_id, product_id, variant_id, uom_id, lot_id,
        quantity_delta, quantity_before, quantity_after, cost_price,
        reference_type, reference_id, reference_line_id, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id,
        ctx.tenantId,
        storeId,
        movement.productId,
        movement.variantId,
        movement.uomId,
        movement.lotId,
        movement.quantity,
        quantityBefore,
        quantityAfter,
        movement.costPrice,
        movement.referenceType,
        movement.referenceId,
        movement.referenceLineId,
        movement.notes,
        ctx.userId
      ]
    );

    // Update stock_on_hand (upsert)
    await this.updateStockOnHand(
      ctx.tenantId,
      storeId,
      movement,
      quantityAfter,
      client
    );

    // Queue event for BigQuery sync
    await EventService.queueEvent(ctx.tenantId, {
      eventType: 'stock_movement',
      entityType: 'stock_ledger',
      entityId: id,
      payload: {
        storeId,
        productId: movement.productId,
        variantId: movement.variantId,
        quantityDelta: movement.quantity,
        quantityAfter,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId
      }
    });

    return ledgerResult.rows[0];
  }

  /**
   * Record multiple movements in a single transaction
   */
  static async recordMovements(
    ctx: TenantContext,
    storeId: string,
    movements: StockMovement[]
  ): Promise<StockLedgerEntry[]> {
    return withTransaction(async (client) => {
      const entries: StockLedgerEntry[] = [];
      for (const movement of movements) {
        const entry = await this.recordMovement(ctx, storeId, movement, client);
        entries.push(entry);
      }
      return entries;
    });
  }

  /**
   * Get current stock level for a product/variant
   */
  static async getStockLevel(
    tenantId: string,
    storeId: string,
    productId?: string,
    variantId?: string,
    uomId?: string,
    lotId?: string,
    client?: PoolClient
  ): Promise<StockOnHand | null> {
    const executeQuery = client ? client.query.bind(client) : query;
    
    const result = await executeQuery<StockOnHand>(
      `SELECT * FROM stock_on_hand 
       WHERE tenant_id = $1 AND store_id = $2 
       AND COALESCE(product_id::text, '') = COALESCE($3::text, '')
       AND COALESCE(variant_id::text, '') = COALESCE($4::text, '')
       AND COALESCE(uom_id::text, '') = COALESCE($5::text, '')
       AND COALESCE(lot_id::text, '') = COALESCE($6::text, '')`,
      [tenantId, storeId, productId, variantId, uomId, lotId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update stock_on_hand after a ledger entry
   */
  private static async updateStockOnHand(
    tenantId: string,
    storeId: string,
    movement: StockMovement,
    newQuantity: number,
    client?: PoolClient
  ): Promise<void> {
    const executeQuery = client ? client.query.bind(client) : query;
    
    // Calculate new average cost if receiving stock
    let avgCostUpdate = '';
    if (movement.quantity > 0 && movement.costPrice) {
      avgCostUpdate = `, avg_cost = (
        (COALESCE(quantity, 0) * COALESCE(avg_cost, 0) + $7 * $8) / 
        NULLIF(COALESCE(quantity, 0) + $7, 0)
      )`;
    }

    // Upsert stock_on_hand
    await executeQuery(
      `INSERT INTO stock_on_hand (
        id, tenant_id, store_id, product_id, variant_id, uom_id, lot_id,
        quantity, avg_cost, last_received_at, last_sold_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $9,
        $7, COALESCE($8, 0),
        ${movement.referenceType === 'GRN' ? 'NOW()' : 'NULL'},
        ${movement.referenceType === 'SALE' ? 'NOW()' : 'NULL'}
      )
      ON CONFLICT (tenant_id, store_id, product_id, variant_id, uom_id, lot_id) 
      DO UPDATE SET 
        quantity = $7
        ${avgCostUpdate}
        ${movement.referenceType === 'GRN' ? ', last_received_at = NOW()' : ''}
        ${movement.referenceType === 'SALE' ? ', last_sold_at = NOW()' : ''}
        , updated_at = NOW()`,
      [
        uuidv4(),
        tenantId,
        storeId,
        movement.productId,
        movement.variantId,
        movement.uomId,
        newQuantity,
        movement.costPrice,
        movement.lotId
      ]
    );
  }

  /**
   * Get stock on hand for a store
   */
  static async getStockOnHand(
    tenantId: string,
    storeId: string,
    options: {
      categoryId?: string;
      brandId?: string;
      lowStockOnly?: boolean;
      outOfStockOnly?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: StockOnHand[]; total: number }> {
    const conditions: string[] = ['soh.tenant_id = $1', 'soh.store_id = $2'];
    const params: unknown[] = [tenantId, storeId];
    let paramIndex = 3;

    if (options.lowStockOnly) {
      conditions.push('soh.quantity <= p.reorder_point AND soh.quantity > 0');
    }

    if (options.outOfStockOnly) {
      conditions.push('soh.quantity <= 0');
    }

    if (options.categoryId) {
      conditions.push(`p.category_id = $${paramIndex++}`);
      params.push(options.categoryId);
    }

    if (options.brandId) {
      conditions.push(`p.brand_id = $${paramIndex++}`);
      params.push(options.brandId);
    }

    if (options.search) {
      conditions.push(`(p.sku ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM stock_on_hand soh
       LEFT JOIN products p ON soh.product_id = p.id
       WHERE ${whereClause}`,
      params
    );

    const itemsResult = await query<StockOnHand>(
      `SELECT soh.*, p.sku, p.name as product_name, p.reorder_point, p.reorder_qty,
              c.name as category_name, b.name as brand_name
       FROM stock_on_hand soh
       LEFT JOIN products p ON soh.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE ${whereClause}
       ORDER BY p.name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      items: itemsResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get stock ledger history
   */
  static async getLedgerHistory(
    tenantId: string,
    options: {
      storeId?: string;
      productId?: string;
      variantId?: string;
      referenceType?: StockReferenceType;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ entries: StockLedgerEntry[]; total: number }> {
    const conditions: string[] = ['sl.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.storeId) {
      conditions.push(`sl.store_id = $${paramIndex++}`);
      params.push(options.storeId);
    }

    if (options.productId) {
      conditions.push(`sl.product_id = $${paramIndex++}`);
      params.push(options.productId);
    }

    if (options.variantId) {
      conditions.push(`sl.variant_id = $${paramIndex++}`);
      params.push(options.variantId);
    }

    if (options.referenceType) {
      conditions.push(`sl.reference_type = $${paramIndex++}`);
      params.push(options.referenceType);
    }

    if (options.startDate) {
      conditions.push(`sl.occurred_at >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`sl.occurred_at <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM stock_ledger sl WHERE ${whereClause}`,
      params
    );

    const entriesResult = await query<StockLedgerEntry>(
      `SELECT sl.*, p.sku, p.name as product_name, s.name as store_name
       FROM stock_ledger sl
       LEFT JOIN products p ON sl.product_id = p.id
       LEFT JOIN stores s ON sl.store_id = s.id
       WHERE ${whereClause}
       ORDER BY sl.occurred_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      entries: entriesResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Check if stock is available for a sale
   */
  static async checkAvailability(
    tenantId: string,
    storeId: string,
    items: Array<{
      productId?: string;
      variantId?: string;
      uomId?: string;
      quantity: number;
    }>
  ): Promise<Array<{ available: boolean; currentStock: number; requested: number }>> {
    const results = [];

    for (const item of items) {
      const stock = await this.getStockLevel(
        tenantId,
        storeId,
        item.productId,
        item.variantId,
        item.uomId
      );

      const currentStock = stock?.availableQuantity || 0;
      results.push({
        available: currentStock >= item.quantity,
        currentStock,
        requested: item.quantity
      });
    }

    return results;
  }

  /**
   * Get low stock items
   */
  static async getLowStockItems(
    tenantId: string,
    storeId?: string
  ): Promise<StockOnHand[]> {
    const storeCondition = storeId ? 'AND soh.store_id = $2' : '';
    const params = storeId ? [tenantId, storeId] : [tenantId];

    const result = await query<StockOnHand>(
      `SELECT soh.*, p.sku, p.name as product_name, p.reorder_point, p.reorder_qty,
              s.name as store_name
       FROM stock_on_hand soh
       JOIN products p ON soh.product_id = p.id
       JOIN stores s ON soh.store_id = s.id
       WHERE soh.tenant_id = $1 ${storeCondition}
       AND soh.quantity <= p.reorder_point
       AND soh.quantity > 0
       AND p.track_inventory = true
       ORDER BY (soh.quantity / NULLIF(p.reorder_point, 0)) ASC`,
      params
    );

    return result.rows;
  }

  /**
   * Get out of stock items
   */
  static async getOutOfStockItems(
    tenantId: string,
    storeId?: string
  ): Promise<StockOnHand[]> {
    const storeCondition = storeId ? 'AND soh.store_id = $2' : '';
    const params = storeId ? [tenantId, storeId] : [tenantId];

    const result = await query<StockOnHand>(
      `SELECT soh.*, p.sku, p.name as product_name, s.name as store_name
       FROM stock_on_hand soh
       JOIN products p ON soh.product_id = p.id
       JOIN stores s ON soh.store_id = s.id
       WHERE soh.tenant_id = $1 ${storeCondition}
       AND soh.quantity <= 0
       AND p.track_inventory = true
       ORDER BY p.name`,
      params
    );

    return result.rows;
  }
}

export default InventoryService;
