import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { POSService } from '../services/pos.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../types/index.js';

const router = Router();

// All POS routes require authentication
router.use(authenticate);

// Validation schemas
const cartItemSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  uomId: z.string().uuid().optional(),
  sku: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  discountType: z.enum(['percent', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
  promotionId: z.string().uuid().optional(),
  notes: z.string().optional()
});

const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'voucher', 'loyalty']),
  amount: z.number().positive(),
  reference: z.string().optional(),
  cardLast4: z.string().optional(),
  voucherId: z.string().uuid().optional()
});

const createSaleSchema = z.object({
  storeId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  items: z.array(cartItemSchema).min(1),
  cartDiscounts: z.array(z.object({
    type: z.enum(['line', 'cart', 'coupon', 'loyalty']),
    code: z.string().optional(),
    description: z.string(),
    amount: z.number()
  })).optional(),
  payments: z.array(paymentSchema).min(1),
  loyaltyPointsRedeemed: z.number().min(0).optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  offlineCreated: z.boolean().optional()
});

// POST /pos/sale - Create a new sale
router.post('/sale', requirePermission(PERMISSIONS.POS_SALE), async (req: Request, res: Response) => {
  try {
    const body = createSaleSchema.parse(req.body);
    const receipt = await POSService.createSale(req.ctx!, body);
    
    res.status(201).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create sale';
    res.status(400).json({
      success: false,
      error: { code: 'SALE_FAILED', message }
    });
  }
});

// POST /pos/refund - Process a refund
router.post('/refund', requirePermission(PERMISSIONS.POS_REFUND), async (req: Request, res: Response) => {
  try {
    const { originalReceiptId, lines, payments } = req.body;
    
    const receipt = await POSService.processRefund(
      req.ctx!,
      originalReceiptId,
      lines,
      payments
    );
    
    res.status(201).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process refund';
    res.status(400).json({
      success: false,
      error: { code: 'REFUND_FAILED', message }
    });
  }
});

// POST /pos/park - Park a sale
router.post('/park', requirePermission(PERMISSIONS.POS_PARK), async (req: Request, res: Response) => {
  try {
    const { storeId, items, customerId, name, notes } = req.body;
    
    const result = await POSService.parkSale(
      req.ctx!,
      storeId,
      items,
      customerId,
      name,
      notes
    );
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to park sale';
    res.status(400).json({
      success: false,
      error: { code: 'PARK_FAILED', message }
    });
  }
});

// GET /pos/parked/:storeId - Get parked sales for a store
router.get('/parked/:storeId', async (req: Request, res: Response) => {
  try {
    const parkedSales = await POSService.getParkedSales(
      req.ctx!.tenantId,
      req.params.storeId
    );
    
    res.json({
      success: true,
      data: parkedSales
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch parked sales' }
    });
  }
});

// POST /pos/recall/:id - Recall a parked sale
router.post('/recall/:id', async (req: Request, res: Response) => {
  try {
    const result = await POSService.recallSale(req.ctx!, req.params.id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to recall sale';
    res.status(404).json({
      success: false,
      error: { code: 'RECALL_FAILED', message }
    });
  }
});

// POST /pos/shift/open - Open a new shift
router.post('/shift/open', async (req: Request, res: Response) => {
  try {
    const { storeId, openingCash, registerId } = req.body;
    
    const shift = await POSService.openShift(
      req.ctx!,
      storeId,
      openingCash,
      registerId
    );
    
    res.status(201).json({
      success: true,
      data: shift
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open shift';
    res.status(400).json({
      success: false,
      error: { code: 'SHIFT_OPEN_FAILED', message }
    });
  }
});

// POST /pos/shift/:id/close - Close a shift
router.post('/shift/:id/close', async (req: Request, res: Response) => {
  try {
    const { closingCash, notes } = req.body;
    
    const shift = await POSService.closeShift(
      req.ctx!,
      req.params.id,
      closingCash,
      notes
    );
    
    res.json({
      success: true,
      data: shift
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to close shift';
    res.status(400).json({
      success: false,
      error: { code: 'SHIFT_CLOSE_FAILED', message }
    });
  }
});

// POST /pos/shift/:id/cash-movement - Record cash movement
router.post('/shift/:id/cash-movement', async (req: Request, res: Response) => {
  try {
    const { type, amount, reason, notes, approvedBy } = req.body;
    
    await POSService.recordCashMovement(
      req.ctx!,
      req.params.id,
      type,
      amount,
      reason,
      notes,
      approvedBy
    );
    
    res.status(201).json({
      success: true,
      data: { message: 'Cash movement recorded' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record cash movement';
    res.status(400).json({
      success: false,
      error: { code: 'CASH_MOVEMENT_FAILED', message }
    });
  }
});

// GET /pos/receipt/:id - Get receipt by ID or number
router.get('/receipt/:id', async (req: Request, res: Response) => {
  try {
    const receipt = await POSService.getReceipt(req.ctx!.tenantId, req.params.id);
    
    if (!receipt) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Receipt not found' }
      });
      return;
    }
    
    res.json({
      success: true,
      data: receipt
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch receipt' }
    });
  }
});

// GET /pos/receipts - Search receipts
router.get('/receipts', async (req: Request, res: Response) => {
  try {
    const { storeId, cashierId, customerId, startDate, endDate, status, type, search, page, limit } = req.query;
    
    const result = await POSService.searchReceipts(req.ctx!.tenantId, {
      storeId: storeId as string,
      cashierId: cashierId as string,
      customerId: customerId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as string,
      type: type as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: page ? (parseInt(page as string) - 1) * (limit ? parseInt(limit as string) : 50) : 0
    });
    
    res.json({
      success: true,
      data: result.receipts,
      pagination: {
        total: result.total,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to fetch receipts' }
    });
  }
});

export default router;
