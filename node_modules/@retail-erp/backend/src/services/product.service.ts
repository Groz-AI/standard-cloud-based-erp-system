import { query } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { TenantContext, Product, ProductVariant, ProductBarcode, Category, Brand } from '../types/index.js';
import { EventService } from './event.service.js';

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  taxGroupId?: string;
  baseUomId?: string;
  costPrice?: number;
  sellPrice?: number;
  imageUrl?: string;
  attributes?: Record<string, unknown>;
  trackInventory?: boolean;
  allowNegativeStock?: boolean;
  reorderPoint?: number;
  reorderQty?: number;
  barcodes?: string[];
  variants?: Array<{
    sku: string;
    name: string;
    attributes: Record<string, string>;
    costPrice?: number;
    sellPrice?: number;
    barcodes?: string[];
  }>;
}

/**
 * Product Service
 * 
 * Handles product master data operations.
 */
export class ProductService {
  /**
   * Create a new product
   */
  static async createProduct(
    ctx: TenantContext,
    input: CreateProductInput
  ): Promise<Product> {
    const productId = uuidv4();

    // Create product
    await query(
      `INSERT INTO products (
        id, tenant_id, sku, name, description, category_id, brand_id,
        tax_group_id, base_uom_id, cost_price, sell_price, image_url,
        attributes, has_variants, track_inventory, allow_negative_stock,
        reorder_point, reorder_qty, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        productId, ctx.tenantId, input.sku, input.name, input.description,
        input.categoryId, input.brandId, input.taxGroupId, input.baseUomId,
        input.costPrice || 0, input.sellPrice || 0, input.imageUrl,
        JSON.stringify(input.attributes || {}),
        (input.variants && input.variants.length > 0),
        input.trackInventory !== false,
        input.allowNegativeStock || false,
        input.reorderPoint || 0, input.reorderQty || 0, ctx.userId
      ]
    );

    // Create barcodes
    if (input.barcodes) {
      for (let i = 0; i < input.barcodes.length; i++) {
        await query(
          `INSERT INTO product_barcodes (id, tenant_id, product_id, barcode, is_primary, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), ctx.tenantId, productId, input.barcodes[i], i === 0, ctx.userId]
        );
      }
    }

    // Create variants
    if (input.variants) {
      for (const variant of input.variants) {
        const variantId = uuidv4();
        await query(
          `INSERT INTO product_variants (
            id, tenant_id, product_id, sku, name, attributes, cost_price, sell_price, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            variantId, ctx.tenantId, productId, variant.sku, variant.name,
            JSON.stringify(variant.attributes),
            variant.costPrice || input.costPrice || 0,
            variant.sellPrice || input.sellPrice || 0,
            ctx.userId
          ]
        );

        // Variant barcodes
        if (variant.barcodes) {
          for (let i = 0; i < variant.barcodes.length; i++) {
            await query(
              `INSERT INTO product_barcodes (id, tenant_id, variant_id, barcode, is_primary, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [uuidv4(), ctx.tenantId, variantId, variant.barcodes[i], i === 0, ctx.userId]
            );
          }
        }
      }
    }

    // Queue event
    await EventService.queueEvent(ctx.tenantId, {
      eventType: EventService.EVENT_TYPES.PRODUCT_CREATED,
      entityType: 'product',
      entityId: productId,
      payload: { sku: input.sku, name: input.name }
    });

    const result = await query<Product>(
      `SELECT * FROM products WHERE id = $1`,
      [productId]
    );

    return result.rows[0];
  }

  /**
   * Update a product
   */
  static async updateProduct(
    ctx: TenantContext,
    productId: string,
    updates: Partial<CreateProductInput>
  ): Promise<Product> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      sku: 'sku',
      name: 'name',
      description: 'description',
      categoryId: 'category_id',
      brandId: 'brand_id',
      taxGroupId: 'tax_group_id',
      baseUomId: 'base_uom_id',
      costPrice: 'cost_price',
      sellPrice: 'sell_price',
      imageUrl: 'image_url',
      trackInventory: 'track_inventory',
      allowNegativeStock: 'allow_negative_stock',
      reorderPoint: 'reorder_point',
      reorderQty: 'reorder_qty'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(updates[key as keyof CreateProductInput]);
      }
    }

    if (updates.attributes) {
      setClauses.push(`attributes = $${paramIndex++}`);
      params.push(JSON.stringify(updates.attributes));
    }

    if (setClauses.length > 0) {
      params.push(productId, ctx.tenantId);
      await query(
        `UPDATE products SET ${setClauses.join(', ')} 
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
        params
      );
    }

    // Queue event
    await EventService.queueEvent(ctx.tenantId, {
      eventType: EventService.EVENT_TYPES.PRODUCT_UPDATED,
      entityType: 'product',
      entityId: productId,
      payload: updates
    });

    const result = await query<Product>(
      `SELECT * FROM products WHERE id = $1 AND tenant_id = $2`,
      [productId, ctx.tenantId]
    );

    return result.rows[0];
  }

  /**
   * Get product by ID
   */
  static async getProduct(
    tenantId: string,
    productId: string
  ): Promise<Product & { variants: ProductVariant[]; barcodes: ProductBarcode[] } | null> {
    const productResult = await query<Product>(
      `SELECT p.*, c.name as category_name, b.name as brand_name, tg.name as tax_group_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN tax_groups tg ON p.tax_group_id = tg.id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [productId, tenantId]
    );

    if (productResult.rows.length === 0) {
      return null;
    }

    const product = productResult.rows[0];

    const variantsResult = await query<ProductVariant>(
      `SELECT * FROM product_variants WHERE product_id = $1 AND tenant_id = $2`,
      [productId, tenantId]
    );

    const barcodesResult = await query<ProductBarcode>(
      `SELECT * FROM product_barcodes 
       WHERE (product_id = $1 OR variant_id IN (SELECT id FROM product_variants WHERE product_id = $1))
       AND tenant_id = $2`,
      [productId, tenantId]
    );

    return {
      ...product,
      variants: variantsResult.rows,
      barcodes: barcodesResult.rows
    };
  }

  /**
   * Search products
   */
  static async searchProducts(
    tenantId: string,
    options: {
      search?: string;
      categoryId?: string;
      brandId?: string;
      isActive?: boolean;
      hasStock?: boolean;
      storeId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ products: Product[]; total: number }> {
    const conditions: string[] = ['p.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.search) {
      conditions.push(`(p.sku ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex} OR 
        EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.barcode ILIKE $${paramIndex}))`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    if (options.categoryId) {
      conditions.push(`p.category_id = $${paramIndex++}`);
      params.push(options.categoryId);
    }

    if (options.brandId) {
      conditions.push(`p.brand_id = $${paramIndex++}`);
      params.push(options.brandId);
    }

    if (options.isActive !== undefined) {
      conditions.push(`p.is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM products p WHERE ${whereClause}`,
      params
    );

    const productsResult = await query<Product>(
      `SELECT p.*, c.name as category_name, b.name as brand_name,
              (SELECT barcode FROM product_barcodes WHERE product_id = p.id AND is_primary = true LIMIT 1) as primary_barcode
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE ${whereClause}
       ORDER BY p.name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Lookup by barcode (fast for POS)
   */
  static async lookupByBarcode(
    tenantId: string,
    barcode: string,
    storeId?: string
  ): Promise<{
    product: Product;
    variant?: ProductVariant;
    price: number;
    stock?: number;
  } | null> {
    // Find barcode
    const barcodeResult = await query<{ product_id: string; variant_id: string }>(
      `SELECT product_id, variant_id FROM product_barcodes 
       WHERE tenant_id = $1 AND barcode = $2`,
      [tenantId, barcode]
    );

    if (barcodeResult.rows.length === 0) {
      return null;
    }

    const { product_id, variant_id } = barcodeResult.rows[0];

    // Get product
    const productResult = await query<Product>(
      `SELECT p.*, tg.rate as tax_rate FROM products p
       LEFT JOIN tax_groups tg ON p.tax_group_id = tg.id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true`,
      [product_id || (await query<{ product_id: string }>(
        `SELECT product_id FROM product_variants WHERE id = $1`, [variant_id]
      )).rows[0]?.product_id, tenantId]
    );

    if (productResult.rows.length === 0) {
      return null;
    }

    const product = productResult.rows[0];
    let variant: ProductVariant | undefined;
    let price = product.sellPrice;

    if (variant_id) {
      const variantResult = await query<ProductVariant>(
        `SELECT * FROM product_variants WHERE id = $1`,
        [variant_id]
      );
      if (variantResult.rows.length > 0) {
        variant = variantResult.rows[0];
        if (variant.sellPrice) {
          price = variant.sellPrice;
        }
      }
    }

    // Get stock if store specified
    let stock: number | undefined;
    if (storeId) {
      const stockResult = await query<{ quantity: number }>(
        `SELECT quantity FROM stock_on_hand 
         WHERE tenant_id = $1 AND store_id = $2 
         AND (product_id = $3 OR variant_id = $4)`,
        [tenantId, storeId, product_id, variant_id]
      );
      stock = stockResult.rows[0]?.quantity || 0;
    }

    return { product, variant, price, stock };
  }

  /**
   * Get categories
   */
  static async getCategories(
    tenantId: string,
    options: { parentId?: string; isActive?: boolean } = {}
  ): Promise<Category[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.parentId !== undefined) {
      if (options.parentId === null) {
        conditions.push('parent_id IS NULL');
      } else {
        conditions.push(`parent_id = $${paramIndex++}`);
        params.push(options.parentId);
      }
    }

    if (options.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }

    const result = await query<Category>(
      `SELECT * FROM categories WHERE ${conditions.join(' AND ')} ORDER BY sort_order, name`,
      params
    );

    return result.rows;
  }

  /**
   * Create category
   */
  static async createCategory(
    ctx: TenantContext,
    data: { code?: string; name: string; parentId?: string; description?: string; imageUrl?: string }
  ): Promise<Category> {
    const id = uuidv4();
    await query(
      `INSERT INTO categories (id, tenant_id, code, name, parent_id, description, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ctx.tenantId, data.code, data.name, data.parentId, data.description, data.imageUrl, ctx.userId]
    );

    const result = await query<Category>(`SELECT * FROM categories WHERE id = $1`, [id]);
    return result.rows[0];
  }

  /**
   * Get brands
   */
  static async getBrands(
    tenantId: string,
    isActive?: boolean
  ): Promise<Brand[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (isActive !== undefined) {
      conditions.push('is_active = $2');
      params.push(isActive);
    }

    const result = await query<Brand>(
      `SELECT * FROM brands WHERE ${conditions.join(' AND ')} ORDER BY name`,
      params
    );

    return result.rows;
  }

  /**
   * Create brand
   */
  static async createBrand(
    ctx: TenantContext,
    data: { code?: string; name: string; logoUrl?: string }
  ): Promise<Brand> {
    const id = uuidv4();
    await query(
      `INSERT INTO brands (id, tenant_id, code, name, logo_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, ctx.tenantId, data.code, data.name, data.logoUrl, ctx.userId]
    );

    const result = await query<Brand>(`SELECT * FROM brands WHERE id = $1`, [id]);
    return result.rows[0];
  }

  /**
   * Add barcode to product/variant
   */
  static async addBarcode(
    ctx: TenantContext,
    productId: string | undefined,
    variantId: string | undefined,
    barcode: string,
    isPrimary: boolean = false
  ): Promise<ProductBarcode> {
    const id = uuidv4();

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await query(
        `UPDATE product_barcodes SET is_primary = false 
         WHERE tenant_id = $1 AND (product_id = $2 OR variant_id = $3)`,
        [ctx.tenantId, productId, variantId]
      );
    }

    await query(
      `INSERT INTO product_barcodes (id, tenant_id, product_id, variant_id, barcode, is_primary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ctx.tenantId, productId, variantId, barcode, isPrimary, ctx.userId]
    );

    const result = await query<ProductBarcode>(`SELECT * FROM product_barcodes WHERE id = $1`, [id]);
    return result.rows[0];
  }
}

export default ProductService;
