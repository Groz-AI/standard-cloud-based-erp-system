import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ProductService } from '../services/product.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../types/index.js';

const router = Router();

router.use(authenticate);

// Validation schemas
const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  taxGroupId: z.string().uuid().optional(),
  baseUomId: z.string().uuid().optional(),
  costPrice: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
  imageUrl: z.string().url().optional(),
  attributes: z.record(z.unknown()).optional(),
  trackInventory: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  reorderPoint: z.number().min(0).optional(),
  reorderQty: z.number().min(0).optional(),
  barcodes: z.array(z.string()).optional(),
  variants: z.array(z.object({
    sku: z.string(),
    name: z.string(),
    attributes: z.record(z.string()),
    costPrice: z.number().min(0).optional(),
    sellPrice: z.number().min(0).optional(),
    barcodes: z.array(z.string()).optional()
  })).optional()
});

// GET /products - List products
router.get('/', requirePermission(PERMISSIONS.MASTER_VIEW), async (req: Request, res: Response) => {
  try {
    const { search, categoryId, brandId, isActive, page, limit } = req.query;
    
    const result = await ProductService.searchProducts(req.ctx!.tenantId, {
      search: search as string,
      categoryId: categoryId as string,
      brandId: brandId as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: page ? (parseInt(page as string) - 1) * (limit ? parseInt(limit as string) : 50) : 0
    });
    
    res.json({
      success: true,
      data: result.products,
      pagination: {
        total: result.total,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch products' }
    });
  }
});

// GET /products/lookup/:barcode - Fast barcode lookup for POS
router.get('/lookup/:barcode', async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    const result = await ProductService.lookupByBarcode(
      req.ctx!.tenantId,
      req.params.barcode,
      storeId as string
    );
    
    if (!result) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Product not found' }
      });
      return;
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'LOOKUP_FAILED', message: 'Failed to lookup product' }
    });
  }
});

// GET /products/:id - Get product by ID
router.get('/:id', requirePermission(PERMISSIONS.MASTER_VIEW), async (req: Request, res: Response) => {
  try {
    const product = await ProductService.getProduct(req.ctx!.tenantId, req.params.id);
    
    if (!product) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Product not found' }
      });
      return;
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch product' }
    });
  }
});

// POST /products - Create product
router.post('/', requirePermission(PERMISSIONS.MASTER_PRODUCT), async (req: Request, res: Response) => {
  try {
    const body = createProductSchema.parse(req.body);
    const product = await ProductService.createProduct(req.ctx!, body);
    
    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create product';
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_FAILED', message }
    });
  }
});

// PATCH /products/:id - Update product
router.patch('/:id', requirePermission(PERMISSIONS.MASTER_PRODUCT), async (req: Request, res: Response) => {
  try {
    const product = await ProductService.updateProduct(req.ctx!, req.params.id, req.body);
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update product';
    res.status(400).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message }
    });
  }
});

// POST /products/:id/barcodes - Add barcode
router.post('/:id/barcodes', requirePermission(PERMISSIONS.MASTER_PRODUCT), async (req: Request, res: Response) => {
  try {
    const { barcode, isPrimary, variantId } = req.body;
    
    const result = await ProductService.addBarcode(
      req.ctx!,
      variantId ? undefined : req.params.id,
      variantId,
      barcode,
      isPrimary
    );
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add barcode';
    res.status(400).json({
      success: false,
      error: { code: 'BARCODE_FAILED', message }
    });
  }
});

// GET /categories - List categories
router.get('/master/categories', requirePermission(PERMISSIONS.MASTER_VIEW), async (req: Request, res: Response) => {
  try {
    const { parentId, isActive } = req.query;
    const categories = await ProductService.getCategories(req.ctx!.tenantId, {
      parentId: parentId as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
    });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch categories' }
    });
  }
});

// POST /categories - Create category
router.post('/master/categories', requirePermission(PERMISSIONS.MASTER_CATEGORY), async (req: Request, res: Response) => {
  try {
    const category = await ProductService.createCategory(req.ctx!, req.body);
    
    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create category';
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_FAILED', message }
    });
  }
});

// GET /brands - List brands
router.get('/master/brands', requirePermission(PERMISSIONS.MASTER_VIEW), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query;
    const brands = await ProductService.getBrands(
      req.ctx!.tenantId,
      isActive === 'true' ? true : isActive === 'false' ? false : undefined
    );
    
    res.json({
      success: true,
      data: brands
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch brands' }
    });
  }
});

// POST /brands - Create brand
router.post('/master/brands', requirePermission(PERMISSIONS.MASTER_CATEGORY), async (req: Request, res: Response) => {
  try {
    const brand = await ProductService.createBrand(req.ctx!, req.body);
    
    res.status(201).json({
      success: true,
      data: brand
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create brand';
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_FAILED', message }
    });
  }
});

export default router;
