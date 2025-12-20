import { query } from '../database/pool.js';
import { TenantContext, Promotion } from '../types/index.js';

export interface PriceResult {
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  priceListId?: string;
  promotionId?: string;
  promotionName?: string;
}

/**
 * Pricing Service
 * 
 * Handles price lookups, price lists, and promotion calculations.
 */
export class PricingService {
  /**
   * Get the effective price for a product/variant at a store
   */
  static async getPrice(
    tenantId: string,
    productId: string | undefined,
    variantId: string | undefined,
    storeId: string,
    quantity: number = 1,
    customerId?: string
  ): Promise<PriceResult> {
    // 1. Get base price from product/variant
    let basePrice = 0;
    
    if (variantId) {
      const variantResult = await query<{ sell_price: number; cost_price: number }>(
        `SELECT pv.sell_price, pv.cost_price FROM product_variants pv
         WHERE pv.id = $1 AND pv.tenant_id = $2`,
        [variantId, tenantId]
      );
      if (variantResult.rows.length > 0 && variantResult.rows[0].sell_price) {
        basePrice = variantResult.rows[0].sell_price;
      }
    }
    
    if (basePrice === 0 && productId) {
      const productResult = await query<{ sell_price: number }>(
        `SELECT sell_price FROM products WHERE id = $1 AND tenant_id = $2`,
        [productId, tenantId]
      );
      if (productResult.rows.length > 0) {
        basePrice = productResult.rows[0].sell_price;
      }
    }

    // 2. Check for price list price (store-specific or channel-specific)
    const priceListResult = await query<{ price: number; price_list_id: string }>(
      `SELECT pli.price, pli.price_list_id
       FROM price_list_items pli
       JOIN price_lists pl ON pli.price_list_id = pl.id
       WHERE pli.tenant_id = $1
       AND (pli.product_id = $2 OR pli.variant_id = $3)
       AND pl.is_active = true
       AND (pl.store_id = $4 OR pl.store_id IS NULL)
       AND (pl.start_date IS NULL OR pl.start_date <= CURRENT_DATE)
       AND (pl.end_date IS NULL OR pl.end_date >= CURRENT_DATE)
       AND (pli.min_qty IS NULL OR pli.min_qty <= $5)
       ORDER BY pl.priority DESC, pli.min_qty DESC NULLS LAST
       LIMIT 1`,
      [tenantId, productId, variantId, storeId, quantity]
    );

    let effectivePrice = basePrice;
    let priceListId: string | undefined;

    if (priceListResult.rows.length > 0) {
      effectivePrice = priceListResult.rows[0].price;
      priceListId = priceListResult.rows[0].price_list_id;
    }

    // 3. Check for applicable promotions
    const promoResult = await this.getApplicablePromotion(
      tenantId,
      productId,
      variantId,
      storeId,
      effectivePrice,
      quantity
    );

    if (promoResult) {
      return {
        unitPrice: effectivePrice - promoResult.discount,
        originalPrice: effectivePrice,
        discountAmount: promoResult.discount,
        priceListId,
        promotionId: promoResult.promotionId,
        promotionName: promoResult.promotionName
      };
    }

    return {
      unitPrice: effectivePrice,
      originalPrice: effectivePrice,
      discountAmount: 0,
      priceListId
    };
  }

  /**
   * Get applicable promotion for a product
   */
  static async getApplicablePromotion(
    tenantId: string,
    productId: string | undefined,
    variantId: string | undefined,
    storeId: string,
    price: number,
    quantity: number
  ): Promise<{ promotionId: string; promotionName: string; discount: number } | null> {
    const now = new Date();

    const promotions = await query<Promotion>(
      `SELECT * FROM promotions
       WHERE tenant_id = $1
       AND is_active = true
       AND (start_date IS NULL OR start_date <= $2)
       AND (end_date IS NULL OR end_date >= $2)
       AND (usage_limit IS NULL OR usage_count < usage_limit)
       AND type IN ('percent_off', 'fixed_off')
       ORDER BY discount_value DESC`,
      [tenantId, now]
    );

    for (const promo of promotions.rows) {
      // Check if promotion applies to this store
      if (promo.applicableStores.length > 0 && !promo.applicableStores.includes(storeId)) {
        continue;
      }

      // Check if promotion applies to this product
      const appliesToProduct = promo.applicableProducts.length === 0 || 
        (productId && promo.applicableProducts.includes(productId)) ||
        (variantId && promo.applicableProducts.includes(variantId));

      if (!appliesToProduct) {
        continue;
      }

      // Check minimum purchase
      const lineTotal = price * quantity;
      if (promo.minPurchase && lineTotal < promo.minPurchase) {
        continue;
      }

      // Calculate discount
      let discount = 0;
      if (promo.type === 'percent_off' && promo.discountValue) {
        discount = price * (promo.discountValue / 100);
      } else if (promo.type === 'fixed_off' && promo.discountValue) {
        discount = promo.discountValue;
      }

      // Apply max discount cap
      if (promo.maxDiscount && discount > promo.maxDiscount) {
        discount = promo.maxDiscount;
      }

      if (discount > 0) {
        return {
          promotionId: promo.id,
          promotionName: promo.name,
          discount
        };
      }
    }

    return null;
  }

  /**
   * Validate and apply a coupon code
   */
  static async validateCoupon(
    tenantId: string,
    code: string,
    cartTotal: number,
    customerId?: string
  ): Promise<{ valid: boolean; discount: number; message?: string; promotionId?: string }> {
    const promoResult = await query<Promotion>(
      `SELECT * FROM promotions
       WHERE tenant_id = $1 AND code = $2 AND type = 'coupon'
       AND is_active = true`,
      [tenantId, code.toUpperCase()]
    );

    if (promoResult.rows.length === 0) {
      return { valid: false, discount: 0, message: 'Invalid coupon code' };
    }

    const promo = promoResult.rows[0];

    // Check dates
    const now = new Date();
    if (promo.startDate && new Date(promo.startDate) > now) {
      return { valid: false, discount: 0, message: 'Coupon not yet active' };
    }
    if (promo.endDate && new Date(promo.endDate) < now) {
      return { valid: false, discount: 0, message: 'Coupon has expired' };
    }

    // Check usage limit
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      return { valid: false, discount: 0, message: 'Coupon usage limit reached' };
    }

    // Check minimum purchase
    if (promo.minPurchase && cartTotal < promo.minPurchase) {
      return { 
        valid: false, 
        discount: 0, 
        message: `Minimum purchase of ${promo.minPurchase} required` 
      };
    }

    // Calculate discount
    let discount = 0;
    if (promo.type === 'coupon' && promo.discountValue) {
      const rules = promo.rules as { discountType?: string };
      if (rules.discountType === 'percent') {
        discount = cartTotal * (promo.discountValue / 100);
      } else {
        discount = promo.discountValue;
      }
    }

    // Apply max discount cap
    if (promo.maxDiscount && discount > promo.maxDiscount) {
      discount = promo.maxDiscount;
    }

    return {
      valid: true,
      discount,
      promotionId: promo.id
    };
  }

  /**
   * Increment coupon usage count
   */
  static async incrementCouponUsage(
    tenantId: string,
    promotionId: string
  ): Promise<void> {
    await query(
      `UPDATE promotions SET usage_count = usage_count + 1
       WHERE id = $1 AND tenant_id = $2`,
      [promotionId, tenantId]
    );
  }

  /**
   * Get all active promotions for a store
   */
  static async getActivePromotions(
    tenantId: string,
    storeId?: string
  ): Promise<Promotion[]> {
    const now = new Date();
    
    let storeFilter = '';
    const params: unknown[] = [tenantId, now];
    
    if (storeId) {
      storeFilter = `AND (applicable_stores = '[]'::jsonb OR applicable_stores @> $3::jsonb)`;
      params.push(JSON.stringify([storeId]));
    }

    const result = await query<Promotion>(
      `SELECT * FROM promotions
       WHERE tenant_id = $1
       AND is_active = true
       AND (start_date IS NULL OR start_date <= $2)
       AND (end_date IS NULL OR end_date >= $2)
       ${storeFilter}
       ORDER BY name`,
      params
    );

    return result.rows;
  }

  /**
   * Create or update a price list
   */
  static async upsertPriceList(
    ctx: TenantContext,
    data: {
      id?: string;
      code: string;
      name: string;
      storeId?: string;
      channel?: string;
      currencyCode?: string;
      priority?: number;
      startDate?: Date;
      endDate?: Date;
      isActive?: boolean;
    }
  ): Promise<{ id: string }> {
    const { id, ...fields } = data;

    if (id) {
      await query(
        `UPDATE price_lists SET
          code = $1, name = $2, store_id = $3, channel = $4,
          currency_code = $5, priority = $6, start_date = $7,
          end_date = $8, is_active = $9
         WHERE id = $10 AND tenant_id = $11`,
        [
          fields.code, fields.name, fields.storeId, fields.channel,
          fields.currencyCode, fields.priority || 0, fields.startDate,
          fields.endDate, fields.isActive ?? true, id, ctx.tenantId
        ]
      );
      return { id };
    }

    const result = await query<{ id: string }>(
      `INSERT INTO price_lists (
        id, tenant_id, code, name, store_id, channel,
        currency_code, priority, start_date, end_date, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        crypto.randomUUID(), ctx.tenantId, fields.code, fields.name,
        fields.storeId, fields.channel, fields.currencyCode,
        fields.priority || 0, fields.startDate, fields.endDate,
        fields.isActive ?? true, ctx.userId
      ]
    );

    return result.rows[0];
  }

  /**
   * Set price list items
   */
  static async setPriceListItem(
    ctx: TenantContext,
    priceListId: string,
    productId: string | undefined,
    variantId: string | undefined,
    price: number,
    minQty?: number,
    uomId?: string
  ): Promise<void> {
    await query(
      `INSERT INTO price_list_items (
        id, tenant_id, price_list_id, product_id, variant_id, uom_id, price, min_qty, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, price_list_id, product_id, variant_id, uom_id, min_qty)
      DO UPDATE SET price = $7`,
      [
        crypto.randomUUID(), ctx.tenantId, priceListId,
        productId, variantId, uomId, price, minQty || 1, ctx.userId
      ]
    );
  }
}

export default PricingService;
