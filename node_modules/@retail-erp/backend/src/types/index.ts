// Core types for the Retail ERP system

export interface TenantContext {
  tenantId: string;
  userId: string;
  storeId?: string;
  permissions: string[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

// Entity types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  timezone: string;
  settings: Record<string, unknown>;
  features: TenantFeatures;
  status: 'active' | 'suspended' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantFeatures {
  expiryTracking: boolean;
  lotTracking: boolean;
}

export interface Store {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  defaultStoreId?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  taxGroupId?: string;
  baseUomId?: string;
  costPrice: number;
  sellPrice: number;
  imageUrl?: string;
  attributes: Record<string, unknown>;
  hasVariants: boolean;
  trackInventory: boolean;
  allowNegativeStock: boolean;
  reorderPoint: number;
  reorderQty: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  costPrice?: number;
  sellPrice?: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductBarcode {
  id: string;
  tenantId: string;
  productId?: string;
  variantId?: string;
  barcode: string;
  barcodeType: string;
  isPrimary: boolean;
  createdAt: Date;
}

export interface Category {
  id: string;
  tenantId: string;
  parentId?: string;
  code?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Brand {
  id: string;
  tenantId: string;
  code?: string;
  name: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxGroup {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  rate: number;
  isInclusive: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UoM {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  isBase: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  tenantId: string;
  code?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: string;
  address: Record<string, string>;
  notes?: string;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shift {
  id: string;
  tenantId: string;
  storeId: string;
  cashierId: string;
  registerId?: string;
  shiftNumber?: string;
  openedAt: Date;
  closedAt?: Date;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  cashDifference?: number;
  totalSales: number;
  totalRefunds: number;
  totalCashPayments: number;
  totalCardPayments: number;
  transactionCount: number;
  notes?: string;
  status: 'open' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesReceipt {
  id: string;
  tenantId: string;
  storeId: string;
  shiftId?: string;
  cashierId: string;
  customerId?: string;
  receiptNumber: string;
  receiptDate: Date;
  type: 'sale' | 'refund' | 'exchange';
  status: 'parked' | 'completed' | 'voided' | 'refunded';
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  discountDetails: DiscountDetail[];
  taxDetails: TaxDetail[];
  payments: Payment[];
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  originalReceiptId?: string;
  notes?: string;
  idempotencyKey?: string;
  offlineCreated: boolean;
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesLine {
  id: string;
  tenantId: string;
  receiptId: string;
  lineNumber: number;
  productId?: string;
  variantId?: string;
  uomId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountType?: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  costPrice: number;
  promotionId?: string;
  notes?: string;
  createdAt: Date;
}

export interface DiscountDetail {
  type: 'line' | 'cart' | 'coupon' | 'loyalty';
  code?: string;
  description: string;
  amount: number;
}

export interface TaxDetail {
  code: string;
  name: string;
  rate: number;
  amount: number;
}

export interface Payment {
  method: 'cash' | 'card' | 'voucher' | 'loyalty';
  amount: number;
  reference?: string;
  cardLast4?: string;
  voucherId?: string;
}

export interface StockLedgerEntry {
  id: string;
  tenantId: string;
  storeId: string;
  productId?: string;
  variantId?: string;
  uomId?: string;
  lotId?: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  costPrice?: number;
  referenceType: StockReferenceType;
  referenceId: string;
  referenceLineId?: string;
  notes?: string;
  occurredAt: Date;
  createdAt: Date;
  createdBy?: string;
}

export type StockReferenceType = 
  | 'SALE' 
  | 'RETURN' 
  | 'GRN' 
  | 'TRANSFER_OUT' 
  | 'TRANSFER_IN' 
  | 'ADJUSTMENT' 
  | 'STOCK_COUNT';

export interface StockOnHand {
  id: string;
  tenantId: string;
  storeId: string;
  productId?: string;
  variantId?: string;
  uomId?: string;
  lotId?: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  avgCost: number;
  lastReceivedAt?: Date;
  lastSoldAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GRN {
  id: string;
  tenantId: string;
  storeId: string;
  supplierId?: string;
  purchaseOrderId?: string;
  grnNumber: string;
  grnDate: Date;
  referenceNumber?: string;
  status: 'draft' | 'received' | 'cancelled';
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  receivedBy?: string;
}

export interface Transfer {
  id: string;
  tenantId: string;
  fromStoreId: string;
  toStoreId: string;
  transferNumber: string;
  transferDate: Date;
  status: 'draft' | 'dispatched' | 'in_transit' | 'received' | 'cancelled';
  notes?: string;
  dispatchedAt?: Date;
  receivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  dispatchedBy?: string;
  receivedBy?: string;
}

export interface Adjustment {
  id: string;
  tenantId: string;
  storeId: string;
  adjustmentNumber: string;
  adjustmentDate: Date;
  reason: string;
  status: 'draft' | 'posted' | 'cancelled';
  notes?: string;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  approvedBy?: string;
}

export interface StockCount {
  id: string;
  tenantId: string;
  storeId: string;
  countNumber: string;
  countDate: Date;
  type: 'full' | 'cycle' | 'spot';
  status: 'draft' | 'in_progress' | 'completed' | 'posted' | 'cancelled';
  categoryId?: string;
  notes?: string;
  startedAt?: Date;
  completedAt?: Date;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  approvedBy?: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address: Record<string, string>;
  paymentTerms: number;
  leadTimeDays: number;
  taxId?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  storeId: string;
  supplierId: string;
  poNumber: string;
  poDate: Date;
  expectedDate?: Date;
  status: 'draft' | 'sent' | 'partially_received' | 'received' | 'closed' | 'cancelled';
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  approvedBy?: string;
}

export interface Promotion {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  type: 'percent_off' | 'fixed_off' | 'buy_x_get_y' | 'bundle' | 'coupon';
  rules: Record<string, unknown>;
  discountValue?: number;
  maxDiscount?: number;
  minPurchase?: number;
  applicableProducts: string[];
  applicableCategories: string[];
  applicableStores: string[];
  startDate?: Date;
  endDate?: Date;
  usageLimit?: number;
  usageCount: number;
  isCombinable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  storeId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Permission codes
export const PERMISSIONS = {
  // POS
  POS_SALE: 'POS_SALE',
  POS_REFUND: 'POS_REFUND',
  POS_VOID: 'POS_VOID',
  POS_DISCOUNT: 'POS_DISCOUNT',
  POS_PARK: 'POS_PARK',
  
  // Inventory
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  INVENTORY_ADJUST: 'INVENTORY_ADJUST',
  INVENTORY_TRANSFER: 'INVENTORY_TRANSFER',
  INVENTORY_COUNT: 'INVENTORY_COUNT',
  INVENTORY_GRN: 'INVENTORY_GRN',
  
  // Purchasing
  PURCHASING_VIEW: 'PURCHASING_VIEW',
  PURCHASING_PO: 'PURCHASING_PO',
  PURCHASING_SUPPLIER: 'PURCHASING_SUPPLIER',
  
  // Pricing
  PRICING_VIEW: 'PRICING_VIEW',
  PRICING_EDIT: 'PRICING_EDIT',
  PRICING_PROMO: 'PRICING_PROMO',
  
  // Master Data
  MASTER_VIEW: 'MASTER_VIEW',
  MASTER_PRODUCT: 'MASTER_PRODUCT',
  MASTER_CATEGORY: 'MASTER_CATEGORY',
  
  // Customers
  CUSTOMER_VIEW: 'CUSTOMER_VIEW',
  CUSTOMER_EDIT: 'CUSTOMER_EDIT',
  CUSTOMER_LOYALTY: 'CUSTOMER_LOYALTY',
  
  // Reports
  REPORTS_VIEW: 'REPORTS_VIEW',
  REPORTS_SALES: 'REPORTS_SALES',
  REPORTS_INVENTORY: 'REPORTS_INVENTORY',
  REPORTS_FINANCIAL: 'REPORTS_FINANCIAL',
  
  // Admin
  ADMIN_USERS: 'ADMIN_USERS',
  ADMIN_ROLES: 'ADMIN_ROLES',
  ADMIN_STORES: 'ADMIN_STORES',
  ADMIN_SETTINGS: 'ADMIN_SETTINGS',
  ADMIN_AUDIT: 'ADMIN_AUDIT',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Event types for BigQuery sync
export interface BusinessEvent {
  id: string;
  tenantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}
