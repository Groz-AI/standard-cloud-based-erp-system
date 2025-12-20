-- Retail ERP + POS Database Schema
-- Multi-tenant architecture with strict tenant isolation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TENANCY & ACCESS CONTROL
-- ============================================

-- Tenants (Businesses)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    currency_code CHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'UTC',
    settings JSONB DEFAULT '{}',
    features JSONB DEFAULT '{"expiry_tracking": false, "lot_tracking": false}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores/Branches
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    timezone VARCHAR(50),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(50),
    pin_code VARCHAR(10),
    avatar_url VARCHAR(500),
    default_store_id UUID REFERENCES stores(id),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- User Roles (Many-to-Many)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id, store_id)
);

-- User Store Access (which stores a user can access)
CREATE TABLE user_stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, store_id)
);

-- Audit Log (Append-only)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    store_id UUID REFERENCES stores(id),
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MASTER DATA
-- ============================================

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categories(id),
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Brands
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Tax Groups
CREATE TABLE tax_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,4) NOT NULL,
    is_inclusive BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Units of Measure
CREATE TABLE uoms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_base BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id),
    brand_id UUID REFERENCES brands(id),
    tax_group_id UUID REFERENCES tax_groups(id),
    base_uom_id UUID REFERENCES uoms(id),
    cost_price DECIMAL(15,4) DEFAULT 0,
    sell_price DECIMAL(15,4) DEFAULT 0,
    image_url VARCHAR(500),
    attributes JSONB DEFAULT '{}',
    has_variants BOOLEAN DEFAULT false,
    track_inventory BOOLEAN DEFAULT true,
    allow_negative_stock BOOLEAN DEFAULT false,
    reorder_point DECIMAL(15,4) DEFAULT 0,
    reorder_qty DECIMAL(15,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, sku)
);

-- Product Variants
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    cost_price DECIMAL(15,4),
    sell_price DECIMAL(15,4),
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, sku)
);

-- Product Barcodes
CREATE TABLE product_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL,
    barcode_type VARCHAR(20) DEFAULT 'EAN13',
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, barcode),
    CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

-- Pack Configurations (UoM conversions)
CREATE TABLE pack_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    uom_id UUID NOT NULL REFERENCES uoms(id),
    pack_size DECIMAL(15,4) NOT NULL,
    conversion_factor DECIMAL(15,6) NOT NULL DEFAULT 1,
    barcode VARCHAR(100),
    sell_price DECIMAL(15,4),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

-- Attributes (Size, Color, etc.)
CREATE TABLE attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    values JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- ============================================
-- PRICING
-- ============================================

-- Price Lists
CREATE TABLE price_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    store_id UUID REFERENCES stores(id),
    channel VARCHAR(50),
    currency_code CHAR(3),
    priority INTEGER DEFAULT 0,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Price List Items
CREATE TABLE price_list_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    uom_id UUID REFERENCES uoms(id),
    price DECIMAL(15,4) NOT NULL,
    min_qty DECIMAL(15,4) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

-- Promotions
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('percent_off', 'fixed_off', 'buy_x_get_y', 'bundle', 'coupon')),
    rules JSONB NOT NULL DEFAULT '{}',
    discount_value DECIMAL(15,4),
    max_discount DECIMAL(15,4),
    min_purchase DECIMAL(15,4),
    applicable_products JSONB DEFAULT '[]',
    applicable_categories JSONB DEFAULT '[]',
    applicable_stores JSONB DEFAULT '[]',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_combinable BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- ============================================
-- CUSTOMERS & LOYALTY
-- ============================================

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    date_of_birth DATE,
    gender VARCHAR(20),
    address JSONB DEFAULT '{}',
    notes TEXT,
    tags JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code),
    UNIQUE(tenant_id, email),
    UNIQUE(tenant_id, phone)
);

-- Loyalty Wallets
CREATE TABLE loyalty_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    points_balance DECIMAL(15,2) DEFAULT 0,
    lifetime_points DECIMAL(15,2) DEFAULT 0,
    tier VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, customer_id)
);

-- Loyalty Transactions
CREATE TABLE loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES loyalty_wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
    points DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Vouchers
CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('fixed', 'percent')),
    value DECIMAL(15,4) NOT NULL,
    max_discount DECIMAL(15,4),
    min_purchase DECIMAL(15,4),
    customer_id UUID REFERENCES customers(id),
    usage_limit INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- ============================================
-- POS
-- ============================================

-- Shifts
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    cashier_id UUID NOT NULL REFERENCES users(id),
    register_id VARCHAR(50),
    shift_number VARCHAR(50),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_cash DECIMAL(15,4) DEFAULT 0,
    closing_cash DECIMAL(15,4),
    expected_cash DECIMAL(15,4),
    cash_difference DECIMAL(15,4),
    total_sales DECIMAL(15,4) DEFAULT 0,
    total_refunds DECIMAL(15,4) DEFAULT 0,
    total_cash_payments DECIMAL(15,4) DEFAULT 0,
    total_card_payments DECIMAL(15,4) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift Cash Movements
CREATE TABLE shift_cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('cash_in', 'cash_out', 'drop', 'pickup')),
    amount DECIMAL(15,4) NOT NULL,
    reason VARCHAR(255),
    notes TEXT,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Sales Receipts
CREATE TABLE sales_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    shift_id UUID REFERENCES shifts(id),
    cashier_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    receipt_number VARCHAR(50) NOT NULL,
    receipt_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type VARCHAR(20) DEFAULT 'sale' CHECK (type IN ('sale', 'refund', 'exchange')),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('parked', 'completed', 'voided', 'refunded')),
    subtotal DECIMAL(15,4) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(15,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,4) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15,4) DEFAULT 0,
    change_amount DECIMAL(15,4) DEFAULT 0,
    discount_details JSONB DEFAULT '[]',
    tax_details JSONB DEFAULT '[]',
    payments JSONB DEFAULT '[]',
    loyalty_points_earned DECIMAL(15,2) DEFAULT 0,
    loyalty_points_redeemed DECIMAL(15,2) DEFAULT 0,
    original_receipt_id UUID REFERENCES sales_receipts(id),
    notes TEXT,
    idempotency_key VARCHAR(100),
    offline_created BOOLEAN DEFAULT false,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, receipt_number),
    UNIQUE(tenant_id, idempotency_key)
);

-- Sales Lines
CREATE TABLE sales_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    quantity DECIMAL(15,4) NOT NULL,
    unit_price DECIMAL(15,4) NOT NULL,
    discount_type VARCHAR(20),
    discount_value DECIMAL(15,4) DEFAULT 0,
    discount_amount DECIMAL(15,4) DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    line_total DECIMAL(15,4) NOT NULL,
    cost_price DECIMAL(15,4) DEFAULT 0,
    promotion_id UUID REFERENCES promotions(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parked Sales (for park/recall)
CREATE TABLE parked_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    cashier_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    name VARCHAR(100),
    items JSONB NOT NULL DEFAULT '[]',
    subtotal DECIMAL(15,4) DEFAULT 0,
    discount_amount DECIMAL(15,4) DEFAULT 0,
    parked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVENTORY
-- ============================================

-- Stock Ledger (Source of Truth)
CREATE TABLE stock_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    quantity_delta DECIMAL(15,4) NOT NULL,
    quantity_before DECIMAL(15,4) NOT NULL,
    quantity_after DECIMAL(15,4) NOT NULL,
    cost_price DECIMAL(15,4),
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    reference_line_id UUID,
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Stock on Hand (Materialized current state)
CREATE TABLE stock_on_hand (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(15,4) DEFAULT 0,
    available_quantity DECIMAL(15,4) GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    avg_cost DECIMAL(15,4) DEFAULT 0,
    last_received_at TIMESTAMPTZ,
    last_sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, store_id, product_id, variant_id, uom_id, lot_id)
);

-- Suppliers
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address JSONB DEFAULT '{}',
    payment_terms INTEGER DEFAULT 30,
    lead_time_days INTEGER DEFAULT 7,
    tax_id VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, code)
);

-- Goods Received Notes (GRN)
CREATE TABLE grns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    supplier_id UUID REFERENCES suppliers(id),
    purchase_order_id UUID,
    grn_number VARCHAR(50) NOT NULL,
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'cancelled')),
    subtotal DECIMAL(15,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,4) DEFAULT 0,
    notes TEXT,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, grn_number)
);

-- GRN Lines
CREATE TABLE grn_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    grn_id UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    ordered_qty DECIMAL(15,4),
    received_qty DECIMAL(15,4) NOT NULL,
    unit_cost DECIMAL(15,4) NOT NULL,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    line_total DECIMAL(15,4) NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Adjustments
CREATE TABLE adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    adjustment_number VARCHAR(50) NOT NULL,
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
    notes TEXT,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, adjustment_number)
);

-- Adjustment Lines
CREATE TABLE adjustment_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    adjustment_id UUID NOT NULL REFERENCES adjustments(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    quantity_delta DECIMAL(15,4) NOT NULL,
    cost_price DECIMAL(15,4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transfers
CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    from_store_id UUID NOT NULL REFERENCES stores(id),
    to_store_id UUID NOT NULL REFERENCES stores(id),
    transfer_number VARCHAR(50) NOT NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'dispatched', 'in_transit', 'received', 'cancelled')),
    notes TEXT,
    dispatched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    dispatched_by UUID REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, transfer_number)
);

-- Transfer Lines
CREATE TABLE transfer_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    quantity DECIMAL(15,4) NOT NULL,
    received_qty DECIMAL(15,4),
    cost_price DECIMAL(15,4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Counts
CREATE TABLE stock_counts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    count_number VARCHAR(50) NOT NULL,
    count_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(20) DEFAULT 'full' CHECK (type IN ('full', 'cycle', 'spot')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'posted', 'cancelled')),
    category_id UUID REFERENCES categories(id),
    notes TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, count_number)
);

-- Stock Count Lines
CREATE TABLE stock_count_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    lot_id UUID,
    system_qty DECIMAL(15,4) NOT NULL,
    counted_qty DECIMAL(15,4),
    variance_qty DECIMAL(15,4) GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - system_qty) STORED,
    cost_price DECIMAL(15,4),
    notes TEXT,
    counted_at TIMESTAMPTZ,
    counted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PURCHASING
-- ============================================

-- Purchase Orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    po_number VARCHAR(50) NOT NULL,
    po_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled')),
    subtotal DECIMAL(15,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,4) DEFAULT 0,
    notes TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, po_number)
);

-- Purchase Order Lines
CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    uom_id UUID REFERENCES uoms(id),
    quantity DECIMAL(15,4) NOT NULL,
    received_qty DECIMAL(15,4) DEFAULT 0,
    unit_cost DECIMAL(15,4) NOT NULL,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    line_total DECIMAL(15,4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier Invoices
CREATE TABLE supplier_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    purchase_order_id UUID REFERENCES purchase_orders(id),
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    subtotal DECIMAL(15,4) DEFAULT 0,
    tax_amount DECIMAL(15,4) DEFAULT 0,
    total_amount DECIMAL(15,4) DEFAULT 0,
    paid_amount DECIMAL(15,4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'paid', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, supplier_id, invoice_number)
);

-- Invoice Matching
CREATE TABLE invoice_matching (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id),
    grn_id UUID REFERENCES grns(id),
    invoice_id UUID REFERENCES supplier_invoices(id),
    match_status VARCHAR(20) DEFAULT 'pending' CHECK (match_status IN ('pending', 'matched', 'variance', 'approved')),
    po_amount DECIMAL(15,4),
    grn_amount DECIMAL(15,4),
    invoice_amount DECIMAL(15,4),
    variance_amount DECIMAL(15,4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    matched_by UUID REFERENCES users(id)
);

-- ============================================
-- OPTIONAL: LOT/EXPIRY TRACKING
-- ============================================

-- Lots
CREATE TABLE lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    lot_number VARCHAR(100) NOT NULL,
    expiry_date DATE,
    manufacture_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, lot_number)
);

-- ============================================
-- EVENT QUEUE FOR BIGQUERY SYNC
-- ============================================

CREATE TABLE event_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES
-- ============================================

-- Tenant isolation indexes
CREATE INDEX idx_stores_tenant ON stores(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_product_variants_tenant ON product_variants(tenant_id);
CREATE INDEX idx_product_barcodes_tenant ON product_barcodes(tenant_id);
CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_brands_tenant ON brands(tenant_id);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_sales_receipts_tenant ON sales_receipts(tenant_id);
CREATE INDEX idx_stock_ledger_tenant ON stock_ledger(tenant_id);
CREATE INDEX idx_stock_on_hand_tenant ON stock_on_hand(tenant_id);

-- Lookup indexes
CREATE INDEX idx_product_barcodes_barcode ON product_barcodes(tenant_id, barcode);
CREATE INDEX idx_products_sku ON products(tenant_id, sku);
CREATE INDEX idx_product_variants_sku ON product_variants(tenant_id, sku);
CREATE INDEX idx_sales_receipts_number ON sales_receipts(tenant_id, receipt_number);
CREATE INDEX idx_sales_receipts_date ON sales_receipts(tenant_id, receipt_date);
CREATE INDEX idx_sales_receipts_store ON sales_receipts(tenant_id, store_id);
CREATE INDEX idx_stock_ledger_product ON stock_ledger(tenant_id, store_id, product_id);
CREATE INDEX idx_stock_ledger_occurred ON stock_ledger(tenant_id, occurred_at);
CREATE INDEX idx_stock_on_hand_store_product ON stock_on_hand(tenant_id, store_id, product_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX idx_customers_email ON customers(tenant_id, email);
CREATE INDEX idx_shifts_store ON shifts(tenant_id, store_id, status);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_event_queue_status ON event_queue(status, created_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER update_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;
