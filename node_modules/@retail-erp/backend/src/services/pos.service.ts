import { PoolClient } from 'pg';
import { query, withTransaction } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  TenantContext, 
  SalesReceipt, 
  SalesLine,
  Payment,
  DiscountDetail,
  TaxDetail,
  Shift
} from '../types/index.js';
import { InventoryService } from './inventory.service.js';
import { EventService } from './event.service.js';
import { AuditService } from './audit.service.js';
import { PricingService } from './pricing.service.js';

export interface CartItem {
  productId?: string;
  variantId?: string;
  uomId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  taxRate?: number;
  promotionId?: string;
  notes?: string;
}

export interface CreateSaleInput {
  storeId: string;
  shiftId?: string;
  customerId?: string;
  items: CartItem[];
  cartDiscounts?: DiscountDetail[];
  payments: Payment[];
  loyaltyPointsRedeemed?: number;
  notes?: string;
  idempotencyKey?: string;
  offlineCreated?: boolean;
}

/**
 * POS Service
 * 
 * Handles all point-of-sale operations including:
 * - Sales transactions
 * - Returns/refunds
 * - Park/recall
 * - Shift management
 */
export class POSService {
  /**
   * Create a new sale
   */
  static async createSale(
    ctx: TenantContext,
    input: CreateSaleInput
  ): Promise<SalesReceipt> {
    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await query<SalesReceipt>(
        `SELECT * FROM sales_receipts 
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [ctx.tenantId, input.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }

    return withTransaction(async (client) => {
      // Generate receipt number
      const receiptNumber = await this.generateReceiptNumber(ctx.tenantId, input.storeId, client);

      // Calculate totals
      const lines = input.items.map((item, index) => {
        const discountAmount = this.calculateLineDiscount(item);
        const lineSubtotal = item.quantity * item.unitPrice - discountAmount;
        const taxAmount = lineSubtotal * (item.taxRate || 0);
        const lineTotal = lineSubtotal + taxAmount;

        return {
          ...item,
          lineNumber: index + 1,
          discountAmount,
          taxAmount,
          lineTotal
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      const lineDiscountTotal = lines.reduce((sum, line) => sum + line.discountAmount, 0);
      const cartDiscountTotal = (input.cartDiscounts || []).reduce((sum, d) => sum + d.amount, 0);
      const discountAmount = lineDiscountTotal + cartDiscountTotal;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
      const totalAmount = taxableAmount + taxAmount;
      
      const paidAmount = input.payments.reduce((sum, p) => sum + p.amount, 0);
      const changeAmount = Math.max(0, paidAmount - totalAmount);

      // Calculate loyalty points earned
      const loyaltyPointsEarned = Math.floor(totalAmount * 0.01); // 1 point per dollar

      // Create receipt
      const receiptId = uuidv4();
      const receiptResult = await client.query<SalesReceipt>(
        `INSERT INTO sales_receipts (
          id, tenant_id, store_id, shift_id, cashier_id, customer_id,
          receipt_number, receipt_date, type, status,
          subtotal, discount_amount, tax_amount, total_amount,
          paid_amount, change_amount, discount_details, tax_details, payments,
          loyalty_points_earned, loyalty_points_redeemed, notes,
          idempotency_key, offline_created
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'sale', 'completed',
                  $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *`,
        [
          receiptId, ctx.tenantId, input.storeId, input.shiftId, ctx.userId, input.customerId,
          receiptNumber,
          subtotal, discountAmount, taxAmount, totalAmount,
          paidAmount, changeAmount,
          JSON.stringify(input.cartDiscounts || []),
          JSON.stringify(this.calculateTaxDetails(lines)),
          JSON.stringify(input.payments),
          loyaltyPointsEarned, input.loyaltyPointsRedeemed || 0, input.notes,
          input.idempotencyKey, input.offlineCreated || false
        ]
      );

      // Create sales lines
      for (const line of lines) {
        await client.query(
          `INSERT INTO sales_lines (
            id, tenant_id, receipt_id, line_number,
            product_id, variant_id, uom_id, sku, name,
            quantity, unit_price, discount_type, discount_value,
            discount_amount, tax_rate, tax_amount, line_total, cost_price,
            promotion_id, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            uuidv4(), ctx.tenantId, receiptId, line.lineNumber,
            line.productId, line.variantId, line.uomId, line.sku, line.name,
            line.quantity, line.unitPrice, line.discountType, line.discountValue || 0,
            line.discountAmount, line.taxRate || 0, line.taxAmount, line.lineTotal, line.costPrice || 0,
            line.promotionId, line.notes
          ]
        );

        // Update inventory (deduct stock)
        await InventoryService.recordMovement(
          ctx,
          input.storeId,
          {
            productId: line.productId,
            variantId: line.variantId,
            uomId: line.uomId,
            quantity: -line.quantity, // Negative for sale
            costPrice: line.costPrice,
            referenceType: 'SALE',
            referenceId: receiptId,
            referenceLineId: line.productId // Using productId as reference
          },
          client
        );
      }

      // Update shift totals
      if (input.shiftId) {
        const cashPayment = input.payments
          .filter(p => p.method === 'cash')
          .reduce((sum, p) => sum + p.amount, 0);
        const cardPayment = input.payments
          .filter(p => p.method === 'card')
          .reduce((sum, p) => sum + p.amount, 0);

        await client.query(
          `UPDATE shifts SET 
            total_sales = total_sales + $1,
            total_cash_payments = total_cash_payments + $2,
            total_card_payments = total_card_payments + $3,
            transaction_count = transaction_count + 1
          WHERE id = $4`,
          [totalAmount, cashPayment - changeAmount, cardPayment, input.shiftId]
        );
      }

      // Queue event for BigQuery
      await EventService.queueEvent(ctx.tenantId, {
        eventType: EventService.EVENT_TYPES.SALE_COMPLETED,
        entityType: 'sales_receipt',
        entityId: receiptId,
        payload: {
          receiptNumber,
          storeId: input.storeId,
          customerId: input.customerId,
          totalAmount,
          itemCount: lines.length,
          paymentMethods: input.payments.map(p => p.method)
        }
      });

      // Audit log
      await AuditService.log(ctx, {
        action: AuditService.ACTIONS.SALE_COMPLETED,
        entityType: 'sales_receipt',
        entityId: receiptId,
        storeId: input.storeId,
        afterData: { receiptNumber, totalAmount, itemCount: lines.length }
      });

      return receiptResult.rows[0];
    });
  }

  /**
   * Process a refund/return
   */
  static async processRefund(
    ctx: TenantContext,
    originalReceiptId: string,
    linesToRefund: Array<{ lineId: string; quantity: number; reason?: string }>,
    payments: Payment[]
  ): Promise<SalesReceipt> {
    return withTransaction(async (client) => {
      // Get original receipt
      const originalResult = await client.query<SalesReceipt>(
        `SELECT * FROM sales_receipts WHERE id = $1 AND tenant_id = $2`,
        [originalReceiptId, ctx.tenantId]
      );

      if (originalResult.rows.length === 0) {
        throw new Error('Original receipt not found');
      }

      const original = originalResult.rows[0];

      // Get original lines
      const originalLines = await client.query<SalesLine>(
        `SELECT * FROM sales_lines WHERE receipt_id = $1`,
        [originalReceiptId]
      );

      const lineMap = new Map(originalLines.rows.map(l => [l.id, l]));

      // Validate refund quantities
      const refundLines: SalesLine[] = [];
      let refundTotal = 0;

      for (const refund of linesToRefund) {
        const originalLine = lineMap.get(refund.lineId);
        if (!originalLine) {
          throw new Error(`Line ${refund.lineId} not found in original receipt`);
        }
        if (refund.quantity > originalLine.quantity) {
          throw new Error(`Refund quantity exceeds original quantity for line ${refund.lineId}`);
        }

        const ratio = refund.quantity / originalLine.quantity;
        const lineTotal = originalLine.lineTotal * ratio;
        refundTotal += lineTotal;

        refundLines.push({
          ...originalLine,
          quantity: refund.quantity,
          lineTotal
        } as SalesLine);
      }

      // Generate receipt number
      const receiptNumber = await this.generateReceiptNumber(ctx.tenantId, original.storeId, client);

      // Create refund receipt
      const refundId = uuidv4();
      const refundResult = await client.query<SalesReceipt>(
        `INSERT INTO sales_receipts (
          id, tenant_id, store_id, shift_id, cashier_id, customer_id,
          receipt_number, receipt_date, type, status,
          subtotal, discount_amount, tax_amount, total_amount,
          paid_amount, change_amount, payments,
          original_receipt_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'refund', 'completed',
                  $8, 0, 0, $8, $8, 0, $9, $10)
        RETURNING *`,
        [
          refundId, ctx.tenantId, original.storeId, null, ctx.userId, original.customerId,
          receiptNumber,
          -refundTotal,
          JSON.stringify(payments),
          originalReceiptId
        ]
      );

      // Create refund lines and restore inventory
      for (const line of refundLines) {
        await client.query(
          `INSERT INTO sales_lines (
            id, tenant_id, receipt_id, line_number,
            product_id, variant_id, uom_id, sku, name,
            quantity, unit_price, discount_amount, tax_rate, tax_amount, line_total, cost_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            uuidv4(), ctx.tenantId, refundId, line.lineNumber,
            line.productId, line.variantId, line.uomId, line.sku, line.name,
            -line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, -line.lineTotal, line.costPrice
          ]
        );

        // Restore inventory
        await InventoryService.recordMovement(
          ctx,
          original.storeId,
          {
            productId: line.productId || undefined,
            variantId: line.variantId || undefined,
            uomId: line.uomId || undefined,
            quantity: line.quantity, // Positive for return
            costPrice: line.costPrice,
            referenceType: 'RETURN',
            referenceId: refundId
          },
          client
        );
      }

      // Update original receipt status
      await client.query(
        `UPDATE sales_receipts SET status = 'refunded' WHERE id = $1`,
        [originalReceiptId]
      );

      // Queue event
      await EventService.queueEvent(ctx.tenantId, {
        eventType: EventService.EVENT_TYPES.RECEIPT_REFUNDED,
        entityType: 'sales_receipt',
        entityId: refundId,
        payload: {
          originalReceiptId,
          refundAmount: refundTotal,
          lineCount: refundLines.length
        }
      });

      // Audit log
      await AuditService.log(ctx, {
        action: AuditService.ACTIONS.REFUND_ISSUED,
        entityType: 'sales_receipt',
        entityId: refundId,
        storeId: original.storeId,
        afterData: { originalReceiptId, refundAmount: refundTotal }
      });

      return refundResult.rows[0];
    });
  }

  /**
   * Park a sale for later
   */
  static async parkSale(
    ctx: TenantContext,
    storeId: string,
    items: CartItem[],
    customerId?: string,
    name?: string,
    notes?: string
  ): Promise<{ id: string }> {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = items.reduce((sum, item) => sum + this.calculateLineDiscount(item), 0);

    const result = await query<{ id: string }>(
      `INSERT INTO parked_sales (
        id, tenant_id, store_id, cashier_id, customer_id,
        name, items, subtotal, discount_amount, notes,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '24 hours')
      RETURNING id`,
      [
        uuidv4(), ctx.tenantId, storeId, ctx.userId, customerId,
        name || 'Parked Sale',
        JSON.stringify(items),
        subtotal, discountAmount, notes
      ]
    );

    await AuditService.log(ctx, {
      action: AuditService.ACTIONS.SALE_PARKED,
      entityType: 'parked_sale',
      entityId: result.rows[0].id,
      storeId
    });

    return result.rows[0];
  }

  /**
   * Recall a parked sale
   */
  static async recallSale(
    ctx: TenantContext,
    parkedSaleId: string
  ): Promise<{ items: CartItem[]; customerId?: string; notes?: string }> {
    const result = await query<{ items: string; customer_id: string; notes: string }>(
      `SELECT items, customer_id, notes FROM parked_sales 
       WHERE id = $1 AND tenant_id = $2`,
      [parkedSaleId, ctx.tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Parked sale not found');
    }

    // Delete the parked sale
    await query(
      `DELETE FROM parked_sales WHERE id = $1`,
      [parkedSaleId]
    );

    await AuditService.log(ctx, {
      action: AuditService.ACTIONS.SALE_RECALLED,
      entityType: 'parked_sale',
      entityId: parkedSaleId
    });

    return {
      items: JSON.parse(result.rows[0].items),
      customerId: result.rows[0].customer_id,
      notes: result.rows[0].notes
    };
  }

  /**
   * Get parked sales for a store
   */
  static async getParkedSales(
    tenantId: string,
    storeId: string
  ): Promise<Array<{ id: string; name: string; itemCount: number; subtotal: number; parkedAt: Date }>> {
    const result = await query<{ id: string; name: string; items: string; subtotal: number; parked_at: Date }>(
      `SELECT id, name, items, subtotal, parked_at FROM parked_sales 
       WHERE tenant_id = $1 AND store_id = $2 AND expires_at > NOW()
       ORDER BY parked_at DESC`,
      [tenantId, storeId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      itemCount: JSON.parse(row.items).length,
      subtotal: row.subtotal,
      parkedAt: row.parked_at
    }));
  }

  /**
   * Open a new shift
   */
  static async openShift(
    ctx: TenantContext,
    storeId: string,
    openingCash: number,
    registerId?: string
  ): Promise<Shift> {
    // Check if there's already an open shift for this user
    const existingResult = await query<{ id: string }>(
      `SELECT id FROM shifts 
       WHERE tenant_id = $1 AND cashier_id = $2 AND status = 'open'`,
      [ctx.tenantId, ctx.userId]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('You already have an open shift. Please close it first.');
    }

    const shiftNumber = await this.generateShiftNumber(ctx.tenantId, storeId);

    const result = await query<Shift>(
      `INSERT INTO shifts (
        id, tenant_id, store_id, cashier_id, register_id, shift_number,
        opened_at, opening_cash, status
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'open')
      RETURNING *`,
      [
        uuidv4(), ctx.tenantId, storeId, ctx.userId, registerId, shiftNumber, openingCash
      ]
    );

    await AuditService.log(ctx, {
      action: AuditService.ACTIONS.SHIFT_OPENED,
      entityType: 'shift',
      entityId: result.rows[0].id,
      storeId,
      afterData: { openingCash }
    });

    return result.rows[0];
  }

  /**
   * Close a shift
   */
  static async closeShift(
    ctx: TenantContext,
    shiftId: string,
    closingCash: number,
    notes?: string
  ): Promise<Shift> {
    // Get shift with calculations
    const shiftResult = await query<Shift>(
      `SELECT * FROM shifts WHERE id = $1 AND tenant_id = $2 AND status = 'open'`,
      [shiftId, ctx.tenantId]
    );

    if (shiftResult.rows.length === 0) {
      throw new Error('Shift not found or already closed');
    }

    const shift = shiftResult.rows[0];
    
    // Calculate expected cash
    const cashMovementsResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('cash_in', 'drop') THEN amount 
                              WHEN type IN ('cash_out', 'pickup') THEN -amount 
                              ELSE 0 END), 0) as total
       FROM shift_cash_movements WHERE shift_id = $1`,
      [shiftId]
    );

    const cashMovements = parseFloat(cashMovementsResult.rows[0].total);
    const expectedCash = shift.openingCash + shift.totalCashPayments + cashMovements;
    const cashDifference = closingCash - expectedCash;

    const result = await query<Shift>(
      `UPDATE shifts SET 
        closed_at = NOW(),
        closing_cash = $1,
        expected_cash = $2,
        cash_difference = $3,
        notes = $4,
        status = 'closed'
      WHERE id = $5
      RETURNING *`,
      [closingCash, expectedCash, cashDifference, notes, shiftId]
    );

    await AuditService.log(ctx, {
      action: AuditService.ACTIONS.SHIFT_CLOSED,
      entityType: 'shift',
      entityId: shiftId,
      storeId: shift.storeId,
      beforeData: { openingCash: shift.openingCash },
      afterData: { closingCash, expectedCash, cashDifference }
    });

    return result.rows[0];
  }

  /**
   * Record cash in/out during shift
   */
  static async recordCashMovement(
    ctx: TenantContext,
    shiftId: string,
    type: 'cash_in' | 'cash_out' | 'drop' | 'pickup',
    amount: number,
    reason?: string,
    notes?: string,
    approvedBy?: string
  ): Promise<void> {
    await query(
      `INSERT INTO shift_cash_movements (
        id, tenant_id, shift_id, type, amount, reason, notes, approved_by, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(), ctx.tenantId, shiftId, type, amount, reason, notes, approvedBy, ctx.userId
      ]
    );

    await AuditService.log(ctx, {
      action: type === 'cash_in' || type === 'drop' 
        ? AuditService.ACTIONS.CASH_IN 
        : AuditService.ACTIONS.CASH_OUT,
      entityType: 'shift_cash_movement',
      entityId: shiftId,
      afterData: { type, amount, reason }
    });
  }

  /**
   * Get receipt by number or ID
   */
  static async getReceipt(
    tenantId: string,
    identifier: string
  ): Promise<SalesReceipt & { lines: SalesLine[] } | null> {
    const receiptResult = await query<SalesReceipt>(
      `SELECT * FROM sales_receipts 
       WHERE tenant_id = $1 AND (id = $2 OR receipt_number = $2)`,
      [tenantId, identifier]
    );

    if (receiptResult.rows.length === 0) {
      return null;
    }

    const receipt = receiptResult.rows[0];

    const linesResult = await query<SalesLine>(
      `SELECT * FROM sales_lines WHERE receipt_id = $1 ORDER BY line_number`,
      [receipt.id]
    );

    return {
      ...receipt,
      lines: linesResult.rows
    };
  }

  /**
   * Search receipts
   */
  static async searchReceipts(
    tenantId: string,
    options: {
      storeId?: string;
      cashierId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
      status?: string;
      type?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ receipts: SalesReceipt[]; total: number }> {
    const conditions: string[] = ['sr.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.storeId) {
      conditions.push(`sr.store_id = $${paramIndex++}`);
      params.push(options.storeId);
    }

    if (options.cashierId) {
      conditions.push(`sr.cashier_id = $${paramIndex++}`);
      params.push(options.cashierId);
    }

    if (options.customerId) {
      conditions.push(`sr.customer_id = $${paramIndex++}`);
      params.push(options.customerId);
    }

    if (options.status) {
      conditions.push(`sr.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.type) {
      conditions.push(`sr.type = $${paramIndex++}`);
      params.push(options.type);
    }

    if (options.startDate) {
      conditions.push(`sr.receipt_date >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`sr.receipt_date <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    if (options.search) {
      conditions.push(`sr.receipt_number ILIKE $${paramIndex}`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sales_receipts sr WHERE ${whereClause}`,
      params
    );

    const receiptsResult = await query<SalesReceipt>(
      `SELECT sr.*, u.first_name as cashier_name, c.first_name as customer_name, s.name as store_name
       FROM sales_receipts sr
       LEFT JOIN users u ON sr.cashier_id = u.id
       LEFT JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN stores s ON sr.store_id = s.id
       WHERE ${whereClause}
       ORDER BY sr.receipt_date DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      receipts: receiptsResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Helper methods
  private static calculateLineDiscount(item: CartItem): number {
    if (!item.discountType || !item.discountValue) return 0;
    
    const lineSubtotal = item.quantity * item.unitPrice;
    if (item.discountType === 'percent') {
      return lineSubtotal * (item.discountValue / 100);
    }
    return item.discountValue;
  }

  private static calculateTaxDetails(lines: Array<CartItem & { taxAmount: number }>): TaxDetail[] {
    const taxMap = new Map<number, number>();
    
    for (const line of lines) {
      const rate = line.taxRate || 0;
      const current = taxMap.get(rate) || 0;
      taxMap.set(rate, current + line.taxAmount);
    }

    return Array.from(taxMap.entries()).map(([rate, amount]) => ({
      code: `TAX_${rate * 100}`,
      name: `Tax ${rate * 100}%`,
      rate,
      amount
    }));
  }

  private static async generateReceiptNumber(
    tenantId: string,
    storeId: string,
    client?: PoolClient
  ): Promise<string> {
    const executeQuery = client ? client.query.bind(client) : query;
    
    const result = await executeQuery<{ next_val: string }>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_val
       FROM sales_receipts 
       WHERE tenant_id = $1 AND store_id = $2 
       AND receipt_number LIKE $3`,
      [tenantId, storeId, `RCP-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-%`]
    );

    const nextVal = result.rows[0].next_val;
    const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
    return `RCP-${date}-${String(nextVal).padStart(6, '0')}`;
  }

  private static async generateShiftNumber(
    tenantId: string,
    storeId: string
  ): Promise<string> {
    const result = await query<{ next_val: string }>(
      `SELECT COUNT(*) + 1 as next_val
       FROM shifts 
       WHERE tenant_id = $1 AND store_id = $2 
       AND DATE(opened_at) = CURRENT_DATE`,
      [tenantId, storeId]
    );

    const nextVal = result.rows[0].next_val;
    const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
    return `SHF-${date}-${String(nextVal).padStart(3, '0')}`;
  }
}

export default POSService;
