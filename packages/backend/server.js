require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { SignJWT, jwtVerify } = require('jose');
const { generateDocument, DOCUMENT_TYPES, FORMAT_TYPES } = require('./services/documentService');

const app = express();
const PORT = process.env.PORT || 3001;

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Database pool with optimized settings
const isSupabase = process.env.DATABASE_URL?.includes('supabase');
// Remove sslmode parameter if present (conflicts with our ssl config)
const connectionString = process.env.DATABASE_URL?.replace(/[?&]sslmode=\w+/, '');

const pool = new Pool({
  connectionString,
  ssl: isSupabase ? {
    rejectUnauthorized: false,
  } : false,
  max: 20, // Maximum number of clients in the pool
  min: 2, // Minimum number of clients to keep open
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if unable to connect
  allowExitOnIdle: false,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

// Middleware
app.use(helmet());
app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow localhost
    if (origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Allow all Vercel deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow specific CORS_ORIGIN if set
    if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) {
      return callback(null, true);
    }
    
    // Reject all others
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true 
}));
app.use(compression());
app.use(express.json());

// JWT Secret
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'secret');

// Cairo Timezone Helper (Africa/Cairo = UTC+2)
const CAIRO_OFFSET_HOURS = 2;
function getCairoDate() {
  const now = new Date();
  return new Date(now.getTime() + (CAIRO_OFFSET_HOURS * 60 * 60 * 1000));
}
function getCairoStartOfDay() {
  const cairo = getCairoDate();
  // Get start of day in Cairo time, then convert back to UTC for database query
  const cairoMidnight = new Date(Date.UTC(cairo.getUTCFullYear(), cairo.getUTCMonth(), cairo.getUTCDate(), 0, 0, 0, 0));
  // Subtract Cairo offset to get UTC equivalent
  return new Date(cairoMidnight.getTime() - (CAIRO_OFFSET_HOURS * 60 * 60 * 1000));
}
function getCairoEndOfDay() {
  const cairo = getCairoDate();
  const cairoEndOfDay = new Date(Date.UTC(cairo.getUTCFullYear(), cairo.getUTCMonth(), cairo.getUTCDate(), 23, 59, 59, 999));
  return new Date(cairoEndOfDay.getTime() - (CAIRO_OFFSET_HOURS * 60 * 60 * 1000));
}
function parseDateToCairoStart(dateStr) {
  // Parse YYYY-MM-DD and return start of that day in Cairo time (converted to UTC)
  if (!dateStr || typeof dateStr !== 'string') {
    return getCairoStartOfDay();
  }
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return getCairoStartOfDay();
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return getCairoStartOfDay();
    const cairoMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return new Date(cairoMidnight.getTime() - (CAIRO_OFFSET_HOURS * 60 * 60 * 1000));
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return getCairoStartOfDay();
  }
}
function parseDateToCairoEnd(dateStr) {
  // Parse YYYY-MM-DD and return end of that day in Cairo time (converted to UTC)
  if (!dateStr || typeof dateStr !== 'string') {
    return getCairoEndOfDay();
  }
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return getCairoEndOfDay();
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return getCairoEndOfDay();
    const cairoEndOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    return new Date(cairoEndOfDay.getTime() - (CAIRO_OFFSET_HOURS * 60 * 60 * 1000));
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return getCairoEndOfDay();
  }
}

// Auth middleware
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Super Admin middleware - requires user to be super admin (tenant_id is null)
async function requireSuperAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    // Super admin has isSuperAdmin flag set to true
    if (!payload.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database test endpoint
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as pg_version');
    res.json({ 
      status: 'Database connected', 
      time: result.rows[0].time,
      version: result.rows[0].pg_version
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Database connection failed', 
      error: error.message,
      code: error.code
    });
  }
});

// Check if super admin exists
app.get('/test-users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT email, first_name, last_name, tenant_id, is_active FROM users WHERE tenant_id IS NULL'
    );
    res.json({ 
      status: 'Success',
      superAdminCount: result.rows.length,
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: error.code
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // First check if this is a super admin (tenant_id is NULL)
    const superAdminCheck = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND tenant_id IS NULL AND is_active = true`,
      [email]
    );
    
    if (superAdminCheck.rows.length > 0) {
      const superAdmin = superAdminCheck.rows[0];
      const validPassword = await bcrypt.compare(password, superAdmin.password_hash);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate super admin token
      const token = await new SignJWT({
        userId: superAdmin.id,
        tenantId: null,
        email: superAdmin.email,
        isSuperAdmin: true,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(process.env.JWT_EXPIRES_IN || '24h')
        .sign(JWT_SECRET);
      
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [superAdmin.id]);
      
      return res.json({
        data: {
          accessToken: token,
          refreshToken: token,
          user: {
            id: superAdmin.id,
            email: superAdmin.email,
            firstName: superAdmin.first_name,
            lastName: superAdmin.last_name || '',
            isSuperAdmin: true,
            mustChangePassword: superAdmin.must_change_password || false,
          },
          tenant: null,
          stores: [],
          permissions: ['*'],
          isSuperAdmin: true,
        }
      });
    }
    
    // Regular tenant user login
    const result = await pool.query(
      `SELECT u.*, t.name as tenant_name, t.currency_code, t.settings as tenant_settings,
              t.status as tenant_status, t.store_limit,
              array_agg(DISTINCT r.permissions) as role_permissions
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.email = $1 AND u.is_active = true
       GROUP BY u.id, t.id`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Check if tenant is suspended
    if (user.tenant_status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
    }
    
    if (user.tenant_status === 'cancelled') {
      return res.status(403).json({ error: 'Your account has been cancelled.' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Get user stores
    let storesResult = await pool.query(
      `SELECT s.* FROM stores s
       JOIN user_stores us ON us.store_id = s.id
       WHERE us.user_id = $1`,
      [user.id]
    );
    
    // If user has no stores, check for tenant stores and assign, or create one
    if (storesResult.rows.length === 0) {
      console.log('No stores found for user, checking tenant stores...');
      
      // Check if tenant has any stores
      const tenantStores = await pool.query(
        `SELECT * FROM stores WHERE tenant_id = $1 LIMIT 1`,
        [user.tenant_id]
      );
      
      let storeToAssign;
      if (tenantStores.rows.length === 0) {
        // Create a default store for the tenant
        console.log('Creating default store for tenant...');
        const newStore = await pool.query(
          `INSERT INTO stores (tenant_id, code, name) VALUES ($1, 'MAIN', 'Main Store') RETURNING *`,
          [user.tenant_id]
        );
        storeToAssign = newStore.rows[0];
      } else {
        storeToAssign = tenantStores.rows[0];
      }
      
      // Assign store to user
      await pool.query(
        `INSERT INTO user_stores (user_id, store_id, is_default) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
        [user.id, storeToAssign.id]
      );
      
      // Update user's default store
      await pool.query(
        `UPDATE users SET default_store_id = $1 WHERE id = $2`,
        [storeToAssign.id, user.id]
      );
      
      storesResult = { rows: [storeToAssign] };
    }
    
    // Generate token
    const token = await new SignJWT({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(process.env.JWT_EXPIRES_IN || '24h')
      .sign(JWT_SECRET);
    
    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    
    // Get active store count for tenant
    const storeCountResult = await pool.query(
      `SELECT COUNT(*)::INTEGER as count FROM stores WHERE tenant_id = $1 AND is_active = true`,
      [user.tenant_id]
    );
    const activeStoreCount = storeCountResult.rows[0]?.count || 0;
    
    res.json({
      data: {
        accessToken: token,
        refreshToken: token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name || '',
          tenantId: user.tenant_id,
          defaultStoreId: user.default_store_id,
          mustChangePassword: user.must_change_password || false,
        },
        tenant: {
          id: user.tenant_id,
          name: user.tenant_name,
          slug: user.tenant_name.toLowerCase().replace(/\s+/g, '-'),
          currencyCode: user.currency_code,
          storeLimit: user.store_limit,
          activeStoreCount: activeStoreCount,
        },
        stores: storesResult.rows.map(s => ({ id: s.id, code: s.code, name: s.name })),
        permissions: (user.role_permissions || []).flat().filter(Boolean),
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register tenant - DISABLED (only Super Admin can create tenants)
app.post('/api/auth/register', (req, res) => {
  // Public registration is disabled - only Super Admin can create tenant accounts
  return res.status(403).json({ 
    error: 'Public registration is disabled. Please contact the administrator to create an account.' 
  });
});

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, t.name as tenant_name, t.currency_code
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      tenant: { id: user.tenant_id, name: user.tenant_name, currency: user.currency_code },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Products - List
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const { search, storeId } = req.query;
    console.log('GET /api/products - tenantId:', req.user.tenantId, 'search:', search, 'storeId:', storeId);
    
    // If storeId is provided, include store-specific stock quantity
    let query;
    const params = [req.user.tenantId];
    
    if (storeId) {
      query = `SELECT p.*, c.name as category_name, b.name as brand_name,
                      COALESCE(soh.quantity, 0) as stock_quantity,
                      COALESCE(soh.reserved_quantity, 0) as reserved_quantity,
                      COALESCE(soh.quantity, 0) - COALESCE(soh.reserved_quantity, 0) as available_quantity
               FROM products p
               LEFT JOIN categories c ON c.id = p.category_id
               LEFT JOIN brands b ON b.id = p.brand_id
               LEFT JOIN stock_on_hand soh ON soh.product_id = p.id AND soh.store_id = $2
               WHERE p.tenant_id = $1 AND p.is_active = true`;
      params.push(storeId);
    } else {
      query = `SELECT p.*, c.name as category_name, b.name as brand_name,
                      0 as stock_quantity, 0 as reserved_quantity, 0 as available_quantity
               FROM products p
               LEFT JOIN categories c ON c.id = p.category_id
               LEFT JOIN brands b ON b.id = p.brand_id
               WHERE p.tenant_id = $1 AND p.is_active = true`;
    }
    
    if (search) {
      const searchParamIndex = storeId ? 3 : 2;
      query += ` AND (p.name ILIKE $${searchParamIndex} OR p.sku ILIKE $${searchParamIndex})`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY p.name`;
    
    const result = await pool.query(query, params);
    console.log('GET /api/products - found:', result.rows.length, 'products');
    res.json({ products: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Products - Create (with auto-barcode)
app.post('/api/products', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sku, name, description, categoryId, brandId, costPrice, sellPrice, barcode } = req.body;
    
    await client.query('BEGIN');
    
    // Create product
    const result = await client.query(
      `INSERT INTO products (tenant_id, sku, name, description, category_id, brand_id, cost_price, sell_price, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.tenantId, sku, name, description, categoryId || null, brandId || null, costPrice || 0, sellPrice || 0, req.user.userId]
    );
    
    const product = result.rows[0];
    
    // Auto-generate barcode if not provided (EAN-13 format)
    const barcodeValue = barcode || generateBarcode(req.user.tenantId, product.id);
    
    // Insert barcode
    await client.query(
      `INSERT INTO product_barcodes (tenant_id, product_id, barcode, is_primary, created_by)
       VALUES ($1, $2, $3, true, $4)`,
      [req.user.tenantId, product.id, barcodeValue, req.user.userId]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ ...product, barcode: barcodeValue });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product: ' + error.message });
  } finally {
    client.release();
  }
});

// Helper: Generate barcode (EAN-13 like)
function generateBarcode(tenantId, productId) {
  const prefix = '200'; // Internal use prefix
  const tenantPart = tenantId.replace(/-/g, '').slice(0, 4);
  const timestamp = Date.now().toString().slice(-6);
  const base = prefix + tenantPart.slice(0, 4) + timestamp;
  // Calculate check digit (simplified)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i] || '0') * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return (base + checkDigit).slice(0, 13).padStart(13, '0');
}

// Products - Get single product
app.get('/api/products/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, b.name as brand_name,
              (SELECT barcode FROM product_barcodes WHERE product_id = p.id AND is_primary = true LIMIT 1) as barcode
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Products - Update
app.put('/api/products/:id', authenticate, async (req, res) => {
  try {
    const { sku, name, description, categoryId, brandId, costPrice, sellPrice, reorderPoint } = req.body;
    const result = await pool.query(
      `UPDATE products SET 
        sku = COALESCE($1, sku),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        category_id = $4,
        brand_id = $5,
        cost_price = COALESCE($6, cost_price),
        sell_price = COALESCE($7, sell_price),
        reorder_point = COALESCE($8, reorder_point),
        updated_at = NOW()
       WHERE id = $9 AND tenant_id = $10
       RETURNING *`,
      [sku, name, description, categoryId || null, brandId || null, costPrice, sellPrice, reorderPoint, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Products - Delete (soft delete)
app.delete('/api/products/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE products SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Low Stock Alerts
app.get('/api/inventory/low-stock', authenticate, async (req, res) => {
  try {
    const { storeId, threshold = 10 } = req.query;
    let query = `
      SELECT p.id, p.sku, p.name, p.reorder_point,
             COALESCE(soh.quantity, 0) as current_stock,
             GREATEST(p.reorder_point, $2) as alert_threshold
      FROM products p
      LEFT JOIN stock_on_hand soh ON soh.product_id = p.id ${storeId ? 'AND soh.store_id = $3' : ''}
      WHERE p.tenant_id = $1 AND p.is_active = true
        AND COALESCE(soh.quantity, 0) < GREATEST(p.reorder_point, $2)
      ORDER BY COALESCE(soh.quantity, 0) ASC
      LIMIT 50`;
    
    const params = storeId ? [req.user.tenantId, threshold, storeId] : [req.user.tenantId, threshold];
    const result = await pool.query(query, params);
    
    res.json({ 
      alerts: result.rows,
      count: result.rows.length,
      threshold: parseInt(threshold)
    });
  } catch (error) {
    console.error('Low stock error:', error);
    res.status(500).json({ error: 'Failed to get low stock alerts' });
  }
});

// Products - Barcode lookup (fast POS)
app.get('/api/products/lookup/:barcode', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, pb.barcode, 
              COALESCE(soh.quantity, 0) as stock_on_hand
       FROM product_barcodes pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN stock_on_hand soh ON soh.product_id = p.id
       WHERE pb.tenant_id = $1 AND pb.barcode = $2`,
      [req.user.tenantId, req.params.barcode]
    );
    if (result.rows.length === 0) {
      // Try SKU lookup
      const skuResult = await pool.query(
        `SELECT p.*, COALESCE(soh.quantity, 0) as stock_on_hand
         FROM products p
         LEFT JOIN stock_on_hand soh ON soh.product_id = p.id
         WHERE p.tenant_id = $1 AND p.sku = $2`,
        [req.user.tenantId, req.params.barcode]
      );
      if (skuResult.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.json(skuResult.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// POS - Create Sale
app.post('/api/pos/sale', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { storeId, items, payments, customerId, discountAmount = 0, shiftId } = req.body;
    
    console.log('POS Sale request:', { storeId, itemCount: items?.length, customerId, shiftId, tenantId: req.user.tenantId });
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }
    if (!payments || payments.length === 0) {
      return res.status(400).json({ error: 'No payment information' });
    }
    
    await client.query('BEGIN');
    
    // Get current open shift for user (optional - if shiftId not provided, find it)
    let activeShiftId = shiftId;
    if (!activeShiftId) {
      const shiftResult = await client.query(`
        SELECT id FROM shifts 
        WHERE tenant_id = $1 AND cashier_id = $2 AND store_id = $3 AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1
      `, [req.user.tenantId, req.user.userId, storeId]);
      activeShiftId = shiftResult.rows[0]?.id || null;
    }
    
    // Check stock availability for all items
    const stockIssues = [];
    for (const item of items) {
      const stockResult = await client.query(
        `SELECT COALESCE(quantity, 0) as quantity FROM stock_on_hand 
         WHERE tenant_id = $1 AND store_id = $2 AND product_id = $3`,
        [req.user.tenantId, storeId, item.productId]
      );
      const availableQty = parseFloat(stockResult.rows[0]?.quantity) || 0;
      if (item.quantity > availableQty) {
        stockIssues.push({
          name: item.name,
          requested: item.quantity,
          available: availableQty
        });
      }
    }
    
    if (stockIssues.length > 0) {
      await client.query('ROLLBACK');
      const issueList = stockIssues.map(i => `${i.name}: requested ${i.requested}, available ${i.available}`).join('; ');
      return res.status(400).json({ 
        error: 'Insufficient stock',
        message: `Stock exceeded for: ${issueList}`,
        stockIssues 
      });
    }
    
    // Generate receipt number
    const countResult = await client.query(
      `SELECT COUNT(*) + 1 as num FROM sales_receipts WHERE tenant_id = $1`,
      [req.user.tenantId]
    );
    const receiptNumber = `RCP-${String(countResult.rows[0].num).padStart(6, '0')}`;
    
    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of items) {
      subtotal += item.quantity * item.unitPrice;
      taxAmount += item.taxAmount || 0;
    }
    const totalAmount = subtotal - discountAmount + taxAmount;
    const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const changeAmount = paidAmount - totalAmount;
    
    // Create receipt (with shift_id if available)
    const receiptResult = await client.query(
      `INSERT INTO sales_receipts (tenant_id, store_id, shift_id, cashier_id, customer_id, receipt_number,
         subtotal, discount_amount, tax_amount, total_amount, paid_amount, change_amount, payments, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed') RETURNING *`,
      [req.user.tenantId, storeId, activeShiftId, req.user.userId, customerId, receiptNumber,
       subtotal, discountAmount, taxAmount, totalAmount, paidAmount, changeAmount, JSON.stringify(payments)]
    );
    const receipt = receiptResult.rows[0];
    
    // Update shift totals if shift is active
    if (activeShiftId) {
      const cashPayment = payments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
      const cardPayment = payments.filter(p => p.method === 'card').reduce((sum, p) => sum + p.amount, 0);
      
      await client.query(`
        UPDATE shifts SET 
          total_sales = total_sales + $1,
          total_cash_payments = total_cash_payments + $2,
          total_card_payments = total_card_payments + $3,
          transaction_count = transaction_count + 1,
          updated_at = NOW()
        WHERE id = $4
      `, [totalAmount, cashPayment, cardPayment, activeShiftId]);
    }
    
    // Create lines and update inventory
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Insert line
      await client.query(
        `INSERT INTO sales_lines (tenant_id, receipt_id, line_number, product_id, sku, name,
           quantity, unit_price, discount_amount, tax_amount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [req.user.tenantId, receipt.id, i + 1, item.productId, item.sku, item.name,
         item.quantity, item.unitPrice, item.discountAmount || 0, item.taxAmount || 0, item.lineTotal]
      );
      
      // Get current stock
      const stockResult = await client.query(
        `SELECT quantity FROM stock_on_hand WHERE tenant_id = $1 AND store_id = $2 AND product_id = $3`,
        [req.user.tenantId, storeId, item.productId]
      );
      const currentQty = stockResult.rows[0]?.quantity || 0;
      const newQty = currentQty - item.quantity;
      
      // Update stock ledger
      await client.query(
        `INSERT INTO stock_ledger (tenant_id, store_id, product_id, quantity_delta, quantity_before, quantity_after,
           reference_type, reference_id, reference_line_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'sale', $7, $8)`,
        [req.user.tenantId, storeId, item.productId, -item.quantity, currentQty, newQty, receipt.id, item.productId]
      );
      
      // Update stock on hand (reduce quantity for sales)
      await client.query(
        `INSERT INTO stock_on_hand (tenant_id, store_id, product_id, quantity)
         VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (product_id, store_id)
         DO UPDATE SET quantity = stock_on_hand.quantity + $4::numeric, updated_at = NOW()`,
        [req.user.tenantId, storeId, item.productId, -item.quantity]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      receipt: { ...receipt, lines: items },
      message: 'Sale completed successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale error:', error);
    res.status(500).json({ error: 'Sale failed: ' + error.message });
  } finally {
    client.release();
  }
});

// Categories - handler function
const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [req.user.tenantId]
    );
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { code, name, parentId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    console.log('Creating category:', { name, code, tenantId: req.user.tenantId, userId: req.user.userId });
    const result = await pool.query(
      `INSERT INTO categories (tenant_id, code, name, parent_id, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.tenantId, code || null, name.trim(), parentId || null, req.user.userId]
    );
    console.log('Category created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error.message, error.detail || '');
    res.status(500).json({ error: 'Failed to create category: ' + error.message });
  }
};

// Categories - Update
const updateCategory = async (req, res) => {
  try {
    const { code, name, parentId } = req.body;
    const result = await pool.query(
      `UPDATE categories SET code = COALESCE($1, code), name = COALESCE($2, name), 
       parent_id = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [code, name, parentId || null, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

// Categories - Delete (soft)
const deleteCategory = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE categories SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

// Categories routes (both paths for compatibility)
app.get('/api/master/categories', authenticate, getCategories);
app.post('/api/master/categories', authenticate, createCategory);
app.get('/api/categories', authenticate, getCategories);
app.post('/api/categories', authenticate, createCategory);
app.put('/api/categories/:id', authenticate, updateCategory);
app.delete('/api/categories/:id', authenticate, deleteCategory);

// Brands - handler function
const getBrands = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM brands WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [req.user.tenantId]
    );
    res.json({ brands: result.rows });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({ error: 'Failed to get brands' });
  }
};

const createBrand = async (req, res) => {
  try {
    const { code, name } = req.body;
    const result = await pool.query(
      `INSERT INTO brands (tenant_id, code, name, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.tenantId, code || null, name, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create brand error:', error);
    res.status(500).json({ error: 'Failed to create brand' });
  }
};

// Brands - Update
const updateBrand = async (req, res) => {
  try {
    const { code, name } = req.body;
    const result = await pool.query(
      `UPDATE brands SET code = COALESCE($1, code), name = COALESCE($2, name), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [code, name, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Brand not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update brand error:', error);
    res.status(500).json({ error: 'Failed to update brand' });
  }
};

// Brands - Delete (soft)
const deleteBrand = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE brands SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Brand not found' });
    res.json({ success: true, message: 'Brand deleted' });
  } catch (error) {
    console.error('Delete brand error:', error);
    res.status(500).json({ error: 'Failed to delete brand' });
  }
};

// Brands routes (both paths for compatibility)
app.get('/api/master/brands', authenticate, getBrands);
app.post('/api/master/brands', authenticate, createBrand);
app.get('/api/brands', authenticate, getBrands);
app.post('/api/brands', authenticate, createBrand);
app.put('/api/brands/:id', authenticate, updateBrand);
app.delete('/api/brands/:id', authenticate, deleteBrand);

// Customers
app.get('/api/customers', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT * FROM customers WHERE tenant_id = $1 AND is_active = true`;
    const params = [req.user.tenantId];
    
    if (search) {
      query += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY first_name`;
    
    const result = await pool.query(query, params);
    res.json({ customers: result.rows });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
});

app.post('/api/customers', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const code = `CUST-${Date.now().toString(36).toUpperCase()}`;
    const result = await pool.query(
      `INSERT INTO customers (tenant_id, code, first_name, last_name, email, phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.tenantId, code, firstName, lastName, email || null, phone || null, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Customers - Update
app.put('/api/customers/:id', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const result = await pool.query(
      `UPDATE customers SET 
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = $3,
        phone = $4,
        updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [firstName, lastName, email || null, phone || null, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Customers - Delete (soft)
app.delete('/api/customers/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE customers SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Inventory - Stock on Hand
app.get('/api/inventory/stock', authenticate, async (req, res) => {
  const { storeId } = req.query;
  let query = `SELECT soh.*, p.sku, p.name as product_name
               FROM stock_on_hand soh
               JOIN products p ON p.id = soh.product_id
               WHERE soh.tenant_id = $1`;
  const params = [req.user.tenantId];
  
  if (storeId) {
    query += ` AND soh.store_id = $2`;
    params.push(storeId);
  }
  
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    const tenantId = req.user.tenantId;
    
    // Today's date range - use Cairo timezone
    const todayStart = getCairoStartOfDay();
    
    console.log('Dashboard stats query (Cairo):', { tenantId, todayStart: todayStart.toISOString(), storeId });
    
    // Today's sales
    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales, COUNT(*) as order_count
       FROM sales_receipts 
       WHERE tenant_id = $1 AND status = 'completed' AND receipt_date >= $2
       ${storeId ? 'AND store_id = $3' : ''}`,
      storeId ? [tenantId, todayStart, storeId] : [tenantId, todayStart]
    );
    
    // Unique customers today
    const customersResult = await pool.query(
      `SELECT COUNT(DISTINCT customer_id) as customer_count
       FROM sales_receipts 
       WHERE tenant_id = $1 AND status = 'completed' AND receipt_date >= $2 AND customer_id IS NOT NULL
       ${storeId ? 'AND store_id = $3' : ''}`,
      storeId ? [tenantId, todayStart, storeId] : [tenantId, todayStart]
    );
    
    // Low stock items (quantity < reorder_point or quantity < 10)
    const lowStockResult = await pool.query(
      `SELECT COUNT(*) as low_stock_count
       FROM stock_on_hand soh
       JOIN products p ON p.id = soh.product_id
       WHERE soh.tenant_id = $1 AND soh.quantity < GREATEST(p.reorder_point, 10)
       ${storeId ? 'AND soh.store_id = $2' : ''}`,
      storeId ? [tenantId, storeId] : [tenantId]
    );
    
    // Total products
    const productsResult = await pool.query(
      `SELECT COUNT(*) as product_count FROM products WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );
    
    // Total customers
    const totalCustomersResult = await pool.query(
      `SELECT COUNT(*) as total_customers FROM customers WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );
    
    res.json({
      data: {
        todaySales: parseFloat(salesResult.rows[0].total_sales) || 0,
        orderCount: parseInt(salesResult.rows[0].order_count) || 0,
        customerCount: parseInt(customersResult.rows[0].customer_count) || 0,
        lowStockCount: parseInt(lowStockResult.rows[0].low_stock_count) || 0,
        productCount: parseInt(productsResult.rows[0].product_count) || 0,
        totalCustomers: parseInt(totalCustomersResult.rows[0].total_customers) || 0,
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// Recent Sales
app.get('/api/dashboard/recent-sales', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    const tenantId = req.user.tenantId;
    
    const result = await pool.query(
      `SELECT sr.id, sr.receipt_number, sr.total_amount, sr.receipt_date,
              c.first_name as customer_first_name, c.last_name as customer_last_name,
              (SELECT COUNT(*) FROM sales_lines sl WHERE sl.receipt_id = sr.id) as item_count
       FROM sales_receipts sr
       LEFT JOIN customers c ON c.id = sr.customer_id
       WHERE sr.tenant_id = $1 AND sr.status = 'completed'
       ${storeId ? 'AND sr.store_id = $2' : ''}
       ORDER BY sr.receipt_date DESC`,
      storeId ? [tenantId, storeId] : [tenantId]
    );
    
    res.json({
      data: result.rows.map(r => ({
        id: r.receipt_number,
        customer: r.customer_first_name ? `${r.customer_first_name} ${r.customer_last_name || ''}`.trim() : 'Walk-in',
        items: parseInt(r.item_count) || 0,
        total: parseFloat(r.total_amount) || 0,
        date: r.receipt_date,
      }))
    });
  } catch (error) {
    console.error('Recent sales error:', error);
    res.status(500).json({ error: 'Failed to get recent sales' });
  }
});

// Top Products
app.get('/api/dashboard/top-products', authenticate, async (req, res) => {
  try {
    const { storeId, limit = 5 } = req.query;
    const tenantId = req.user.tenantId;
    
    // Today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await pool.query(
      `SELECT sl.product_id, sl.name, 
              SUM(sl.quantity) as total_sold,
              SUM(sl.line_total) as total_revenue
       FROM sales_lines sl
       JOIN sales_receipts sr ON sr.id = sl.receipt_id
       WHERE sl.tenant_id = $1 AND sr.status = 'completed' AND sr.receipt_date >= $2
       ${storeId ? 'AND sr.store_id = $3' : ''}
       GROUP BY sl.product_id, sl.name
       ORDER BY total_sold DESC
       LIMIT ${storeId ? '$4' : '$3'}`,
      storeId ? [tenantId, today, storeId, limit] : [tenantId, today, limit]
    );
    
    res.json({
      data: result.rows.map(r => ({
        name: r.name,
        sales: parseInt(r.total_sold) || 0,
        revenue: parseFloat(r.total_revenue) || 0,
      }))
    });
  } catch (error) {
    console.error('Top products error:', error);
    res.status(500).json({ error: 'Failed to get top products' });
  }
});

// Receive Stock - Add inventory
app.post('/api/inventory/receive', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { storeId, items, reference, notes } = req.body;
    // items: [{ productId, quantity, costPrice }]
    
    await client.query('BEGIN');
    
    for (const item of items) {
      const { productId, quantity, costPrice } = item;
      
      // Update or insert stock_on_hand (add quantity for receiving)
      await client.query(
        `INSERT INTO stock_on_hand (tenant_id, store_id, product_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, store_id) 
         DO UPDATE SET quantity = stock_on_hand.quantity + $4, 
                       updated_at = NOW()`,
        [req.user.tenantId, storeId, productId, quantity]
      );
      
      // Log to stock_ledger
      const stockResult = await client.query(
        'SELECT quantity FROM stock_on_hand WHERE store_id = $1 AND product_id = $2',
        [storeId, productId]
      );
      const currentQty = parseFloat(stockResult.rows[0]?.quantity) || 0;
      
      await client.query(
        `INSERT INTO stock_ledger (tenant_id, store_id, product_id, quantity_delta, quantity_before, quantity_after,
         reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'receive', $7, $8, $9)`,
        [req.user.tenantId, storeId, productId, quantity, currentQty - quantity, currentQty, reference || crypto.randomUUID(), notes || '', req.user.userId]
      );
      
      // Update product cost price if provided
      if (costPrice) {
        await client.query(
          `UPDATE products SET cost_price = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
          [costPrice, productId, req.user.tenantId]
        );
      }
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Stock received successfully', itemCount: items.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Receive stock error:', error);
    res.status(500).json({ error: 'Failed to receive stock: ' + error.message });
  } finally {
    client.release();
  }
});

// Purchases History
app.get('/api/inventory/purchases', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    let query = `SELECT sl.*, p.name as product_name, p.sku, s.name as store_name
                 FROM stock_ledger sl
                 JOIN products p ON p.id = sl.product_id
                 LEFT JOIN stores s ON s.id = sl.store_id
                 WHERE sl.tenant_id = $1 AND sl.reference_type = 'receive'`;
    const params = [req.user.tenantId];
    
    if (storeId) {
      params.push(storeId);
      query += ` AND sl.store_id = $${params.length}`;
    }
    
    query += ` ORDER BY sl.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json({ purchases: result.rows });
  } catch (error) {
    console.error('Purchases history error:', error);
    res.status(500).json({ error: 'Failed to get purchases history' });
  }
});

// GRN List - Get all GRNs
app.get('/api/inventory/grns', authenticate, async (req, res) => {
  try {
    const { storeId, search, status } = req.query;
    let query = `
      SELECT g.*, s.name as store_name, 
             sup.name as supplier_name, sup.code as supplier_code,
             u.first_name || ' ' || COALESCE(u.last_name, '') as received_by_name
      FROM grns g
      LEFT JOIN stores s ON s.id = g.store_id
      LEFT JOIN suppliers sup ON sup.id = g.supplier_id
      LEFT JOIN users u ON u.id = g.received_by
      WHERE g.tenant_id = $1
    `;
    const params = [req.user.tenantId];
    let paramIndex = 2;
    
    if (storeId) {
      query += ` AND g.store_id = $${paramIndex}`;
      params.push(storeId);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (g.grn_number ILIKE $${paramIndex} OR sup.name ILIKE $${paramIndex} OR g.reference_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND g.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY g.created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, params);
    res.json({ grns: result.rows });
  } catch (error) {
    console.error('GRN list error:', error);
    res.status(500).json({ error: 'Failed to get GRNs' });
  }
});

// Stock Transfers List
app.get('/api/inventory/stock-transfers', authenticate, async (req, res) => {
  try {
    const { storeId, status } = req.query;
    let query = `
      SELECT t.*, 
             fs.name as from_store_name,
             ts.name as to_store_name,
             u.first_name || ' ' || COALESCE(u.last_name, '') as created_by_name
      FROM stock_transfers t
      LEFT JOIN stores fs ON fs.id = t.from_store_id
      LEFT JOIN stores ts ON ts.id = t.to_store_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.tenant_id = $1
    `;
    const params = [req.user.tenantId];
    let paramIndex = 2;
    
    if (storeId) {
      query += ` AND (t.from_store_id = $${paramIndex} OR t.to_store_id = $${paramIndex})`;
      params.push(storeId);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT 100`;
    
    const result = await pool.query(query, params);
    res.json({ transfers: result.rows });
  } catch (error) {
    console.error('Stock transfers list error:', error);
    res.status(500).json({ error: 'Failed to get stock transfers' });
  }
});

// Stock Adjustments - List
app.get('/api/inventory/adjustments', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    let query = `SELECT sl.*, p.name as product_name, p.sku, s.name as store_name
                 FROM stock_ledger sl
                 JOIN products p ON p.id = sl.product_id
                 LEFT JOIN stores s ON s.id = sl.store_id
                 WHERE sl.tenant_id = $1 AND sl.reference_type = 'adjustment'`;
    const params = [req.user.tenantId];
    
    if (storeId) {
      params.push(storeId);
      query += ` AND sl.store_id = $${params.length}`;
    }
    
    query += ` ORDER BY sl.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json({ adjustments: result.rows });
  } catch (error) {
    console.error('Adjustments history error:', error);
    res.status(500).json({ error: 'Failed to get adjustments history' });
  }
});

// Stock Adjustments - Create
app.post('/api/inventory/adjustments', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { storeId, items, reason, notes } = req.body;
    // items: [{ productId, quantity (positive to add, negative to remove), reason }]
    
    await client.query('BEGIN');
    
    for (const item of items) {
      const { productId, quantity } = item;
      
      // Get current stock
      const stockResult = await client.query(
        'SELECT quantity FROM stock_on_hand WHERE store_id = $1 AND product_id = $2',
        [storeId, productId]
      );
      const currentQty = parseFloat(stockResult.rows[0]?.quantity) || 0;
      const newQty = currentQty + quantity;
      
      // Update stock_on_hand
      await client.query(
        `INSERT INTO stock_on_hand (tenant_id, store_id, product_id, quantity)
         VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (product_id, store_id) 
         DO UPDATE SET quantity = stock_on_hand.quantity + $4::numeric, updated_at = NOW()`,
        [req.user.tenantId, storeId, productId, quantity]
      );
      
      // Log to stock_ledger
      await client.query(
        `INSERT INTO stock_ledger (tenant_id, store_id, product_id, quantity_delta, quantity_before, quantity_after,
         reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'adjustment', $7, $8, $9)`,
        [req.user.tenantId, storeId, productId, quantity, currentQty, newQty, 
         crypto.randomUUID(), reason || notes || '', req.user.userId]
      );
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Stock adjusted successfully', itemCount: items.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust stock: ' + error.message });
  } finally {
    client.release();
  }
});

// Stock Transfers - List
app.get('/api/inventory/transfers', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    let query = `SELECT sl.*, p.name as product_name, p.sku, 
                        s.name as store_name
                 FROM stock_ledger sl
                 JOIN products p ON p.id = sl.product_id
                 LEFT JOIN stores s ON s.id = sl.store_id
                 WHERE sl.tenant_id = $1 AND sl.reference_type IN ('transfer_out', 'transfer_in')`;
    const params = [req.user.tenantId];
    
    if (storeId) {
      params.push(storeId);
      query += ` AND sl.store_id = $${params.length}`;
    }
    
    query += ` ORDER BY sl.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json({ transfers: result.rows });
  } catch (error) {
    console.error('Transfers history error:', error);
    res.status(500).json({ error: 'Failed to get transfers history' });
  }
});

// Stock Transfers - Create
app.post('/api/inventory/transfers', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fromStoreId, toStoreId, items, notes } = req.body;
    // items: [{ productId, quantity }]
    
    if (fromStoreId === toStoreId) {
      return res.status(400).json({ error: 'Source and destination stores must be different' });
    }
    
    await client.query('BEGIN');
    
    const transferId = crypto.randomUUID();
    
    for (const item of items) {
      const { productId, quantity } = item;
      
      // Check stock at source
      const sourceStock = await client.query(
        'SELECT quantity FROM stock_on_hand WHERE store_id = $1 AND product_id = $2',
        [fromStoreId, productId]
      );
      const sourceQty = parseFloat(sourceStock.rows[0]?.quantity) || 0;
      
      if (quantity > sourceQty) {
        const productResult = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
        throw new Error(`Insufficient stock for ${productResult.rows[0]?.name || 'product'}: available ${sourceQty}, requested ${quantity}`);
      }
      
      // Reduce from source store
      await client.query(
        `UPDATE stock_on_hand SET quantity = quantity - $1::numeric, updated_at = NOW()
         WHERE store_id = $2 AND product_id = $3`,
        [quantity, fromStoreId, productId]
      );
      
      // Add to destination store
      await client.query(
        `INSERT INTO stock_on_hand (tenant_id, store_id, product_id, quantity)
         VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (product_id, store_id) 
         DO UPDATE SET quantity = stock_on_hand.quantity + $4::numeric, updated_at = NOW()`,
        [req.user.tenantId, toStoreId, productId, quantity]
      );
      
      // Log transfer out from source
      await client.query(
        `INSERT INTO stock_ledger (tenant_id, store_id, product_id, quantity_delta, quantity_before, quantity_after,
         reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'transfer_out', $7, $8, $9)`,
        [req.user.tenantId, fromStoreId, productId, -quantity, sourceQty, sourceQty - quantity,
         transferId, notes || '', req.user.userId]
      );
      
      // Get destination stock for logging
      const destStock = await client.query(
        'SELECT quantity FROM stock_on_hand WHERE store_id = $1 AND product_id = $2',
        [toStoreId, productId]
      );
      const destQty = parseFloat(destStock.rows[0]?.quantity) || 0;
      
      // Log transfer in to destination
      await client.query(
        `INSERT INTO stock_ledger (tenant_id, store_id, product_id, quantity_delta, quantity_before, quantity_after,
         reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'transfer_in', $7, $8, $9)`,
        [req.user.tenantId, toStoreId, productId, quantity, destQty - quantity, destQty,
         transferId, notes || '', req.user.userId]
      );
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Stock transferred successfully', transferId, itemCount: items.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Failed to transfer stock: ' + error.message });
  } finally {
    client.release();
  }
});

// Stock Ledger - Transaction history
app.get('/api/inventory/ledger', authenticate, async (req, res) => {
  try {
    const { storeId, productId, limit = 50 } = req.query;
    let query = `SELECT sl.*, p.name as product_name, p.sku
                 FROM stock_ledger sl
                 JOIN products p ON p.id = sl.product_id
                 WHERE sl.tenant_id = $1`;
    const params = [req.user.tenantId];
    
    if (storeId) {
      params.push(storeId);
      query += ` AND sl.store_id = $${params.length}`;
    }
    if (productId) {
      params.push(productId);
      query += ` AND sl.product_id = $${params.length}`;
    }
    
    params.push(limit);
    query += ` ORDER BY sl.created_at DESC LIMIT $${params.length}`;
    
    const result = await pool.query(query, params);
    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Stock ledger error:', error);
    res.status(500).json({ error: 'Failed to get stock ledger' });
  }
});

// =====================================================
// REPORTS ENDPOINTS
// =====================================================

// Sales Summary Report
app.get('/api/reports/sales-summary', authenticate, async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;
    const tenantId = req.user.tenantId;
    
    console.log('Sales report request:', { startDate, endDate, storeId, tenantId });
    
    // Use Cairo timezone for date parsing
    let end, start;
    try {
      end = endDate ? parseDateToCairoEnd(endDate) : getCairoEndOfDay();
      start = startDate ? parseDateToCairoStart(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    } catch (dateError) {
      console.error('Date parsing error:', dateError);
      end = new Date();
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    console.log('Sales report query (Cairo):', { tenantId, start: start.toISOString(), end: end.toISOString(), storeId });
    
    let params = [tenantId, start.toISOString(), end.toISOString()];
    let storeFilter = '';
    if (storeId) {
      storeFilter = ' AND sr.store_id = $4';
      params.push(storeId);
    }
    
    // Total sales metrics
    const salesMetrics = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_transaction,
        COALESCE(SUM(discount_amount), 0) as total_discounts
      FROM sales_receipts sr
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
    `, params);
    
    // Daily sales trend - use Cairo timezone (UTC+2) for grouping
    const dailySales = await pool.query(`
      SELECT 
        DATE(receipt_date + INTERVAL '2 hours') as date,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM sales_receipts sr
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY DATE(receipt_date + INTERVAL '2 hours')
      ORDER BY date
    `, params);
    
    // Sales by payment method (extract from JSONB payments field)
    const salesByPayment = await pool.query(`
      SELECT 
        COALESCE(p.value->>'method', 'cash') as payment_method,
        COUNT(DISTINCT sr.id) as transactions,
        COALESCE(SUM((p.value->>'amount')::numeric), 0) as revenue
      FROM sales_receipts sr
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sr.payments, '[]'::jsonb)) AS p(value)
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY COALESCE(p.value->>'method', 'cash')
    `, params);
    
    // Top selling products
    const topProducts = await pool.query(`
      SELECT 
        p.name,
        p.sku,
        SUM(sl.quantity) as units_sold,
        SUM(sl.line_total) as revenue
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY revenue DESC
      LIMIT 10
    `, params);
    
    // Hourly distribution - use Cairo timezone (UTC+2)
    const hourlyDistribution = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM receipt_date + INTERVAL '2 hours') as hour,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM sales_receipts sr
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY EXTRACT(HOUR FROM receipt_date + INTERVAL '2 hours')
      ORDER BY hour
    `, params);
    
    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      metrics: salesMetrics.rows[0],
      dailySales: dailySales.rows,
      salesByPayment: salesByPayment.rows,
      topProducts: topProducts.rows,
      hourlyDistribution: hourlyDistribution.rows,
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// Inventory Report
app.get('/api/reports/inventory', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    const tenantId = req.user.tenantId;
    
    console.log('Inventory report query:', { tenantId, storeId });
    
    let params = [tenantId];
    let storeFilter = '';
    if (storeId) {
      storeFilter = ' AND soh.store_id = $2';
      params.push(storeId);
    }
    
    // Stock summary
    const stockSummary = await pool.query(`
      SELECT 
        COUNT(DISTINCT soh.product_id) as total_products,
        COALESCE(SUM(soh.quantity), 0) as total_units,
        COALESCE(SUM(soh.quantity * p.cost_price), 0) as total_value,
        COALESCE(SUM(soh.quantity * p.sell_price), 0) as retail_value
      FROM stock_on_hand soh
      JOIN products p ON p.id = soh.product_id
      WHERE soh.tenant_id = $1 AND p.is_active = true
        ${storeFilter}
    `, params);
    
    // Low stock items
    const lowStockItems = await pool.query(`
      SELECT 
        p.name, p.sku, p.reorder_point,
        COALESCE(SUM(soh.quantity), 0) as current_stock
      FROM products p
      LEFT JOIN stock_on_hand soh ON soh.product_id = p.id ${storeId ? 'AND soh.store_id = $2' : ''}
      WHERE p.tenant_id = $1 AND p.is_active = true
      GROUP BY p.id, p.name, p.sku, p.reorder_point
      HAVING COALESCE(SUM(soh.quantity), 0) <= p.reorder_point
      ORDER BY current_stock ASC
      LIMIT 20
    `, params);
    
    // Out of stock items
    const outOfStock = await pool.query(`
      SELECT 
        p.name, p.sku
      FROM products p
      LEFT JOIN stock_on_hand soh ON soh.product_id = p.id ${storeId ? 'AND soh.store_id = $2' : ''}
      WHERE p.tenant_id = $1 AND p.is_active = true
      GROUP BY p.id, p.name, p.sku
      HAVING COALESCE(SUM(soh.quantity), 0) <= 0
    `, params);
    
    // Stock by category
    const stockByCategory = await pool.query(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category,
        COUNT(DISTINCT p.id) as products,
        COALESCE(SUM(soh.quantity), 0) as units,
        COALESCE(SUM(soh.quantity * p.cost_price), 0) as value
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_on_hand soh ON soh.product_id = p.id ${storeId ? 'AND soh.store_id = $2' : ''}
      WHERE p.tenant_id = $1 AND p.is_active = true
      GROUP BY c.id, c.name
      ORDER BY value DESC
    `, params);
    
    // Recent stock movements
    const recentMovements = await pool.query(`
      SELECT 
        sl.reference_type,
        COUNT(*) as count,
        SUM(ABS(sl.quantity_delta)) as units
      FROM stock_ledger sl
      WHERE sl.tenant_id = $1 
        AND sl.created_at >= NOW() - INTERVAL '30 days'
        ${storeId ? 'AND sl.store_id = $2' : ''}
      GROUP BY sl.reference_type
    `, params);
    
    res.json({
      summary: stockSummary.rows[0],
      lowStockItems: lowStockItems.rows,
      outOfStockCount: outOfStock.rows.length,
      outOfStockItems: outOfStock.rows,
      stockByCategory: stockByCategory.rows,
      recentMovements: recentMovements.rows,
    });
  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

// Customer Report
app.get('/api/reports/customers', authenticate, async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;
    const tenantId = req.user.tenantId;
    
    // Use Cairo timezone for date parsing
    const end = endDate ? parseDateToCairoEnd(endDate) : getCairoEndOfDay();
    const start = startDate ? parseDateToCairoStart(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Note: Don't filter customer reports by store - customers shop across all stores
    let params = [tenantId, start.toISOString(), end.toISOString()];
    
    // Customer summary
    const customerSummary = await pool.query(`
      SELECT 
        COUNT(DISTINCT c.id) as total_customers,
        COUNT(DISTINCT sr.customer_id) FILTER (WHERE sr.receipt_date >= $2 AND sr.receipt_date <= $3) as active_customers
      FROM customers c
      LEFT JOIN sales_receipts sr ON sr.customer_id = c.id AND sr.tenant_id = $1 AND sr.status = 'completed'
      WHERE c.tenant_id = $1 AND c.is_active = true
    `, [tenantId, start.toISOString(), end.toISOString()]);
    
    // Top customers by revenue - across ALL stores for the tenant
    const topCustomers = await pool.query(`
      SELECT 
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        COUNT(sr.id) as total_orders,
        COALESCE(SUM(sr.total_amount), 0) as total_spent,
        MAX(sr.receipt_date) as last_purchase
      FROM customers c
      JOIN sales_receipts sr ON sr.customer_id = c.id AND sr.tenant_id = $1
      WHERE c.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `, params);
    
    // New vs returning customers
    const customerTypes = await pool.query(`
      SELECT 
        CASE 
          WHEN first_purchase >= $2 THEN 'new'
          ELSE 'returning'
        END as customer_type,
        COUNT(*) as count,
        COALESCE(SUM(period_spend), 0) as revenue
      FROM (
        SELECT 
          c.id,
          MIN(sr.receipt_date) as first_purchase,
          SUM(CASE WHEN sr.receipt_date >= $2 AND sr.receipt_date <= $3 THEN sr.total_amount ELSE 0 END) as period_spend
        FROM customers c
        JOIN sales_receipts sr ON sr.customer_id = c.id AND sr.tenant_id = $1 AND sr.status = 'completed'
        WHERE c.tenant_id = $1
        GROUP BY c.id
        HAVING SUM(CASE WHEN sr.receipt_date >= $2 AND sr.receipt_date <= $3 THEN 1 ELSE 0 END) > 0
      ) sub
      GROUP BY customer_type
    `, params);
    
    // Walk-in vs registered customers - across all stores
    const walkInVsRegistered = await pool.query(`
      SELECT 
        CASE WHEN customer_id IS NULL THEN 'Walk-in' ELSE 'Registered' END as type,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM sales_receipts sr
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
      GROUP BY CASE WHEN customer_id IS NULL THEN 'Walk-in' ELSE 'Registered' END
    `, params);
    
    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: customerSummary.rows[0],
      topCustomers: topCustomers.rows,
      customerTypes: customerTypes.rows,
      walkInVsRegistered: walkInVsRegistered.rows,
    });
  } catch (error) {
    console.error('Customer report error:', error);
    res.status(500).json({ error: 'Failed to generate customer report' });
  }
});

// Profit & Margin Report
app.get('/api/reports/profit', authenticate, async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;
    const tenantId = req.user.tenantId;
    
    // Use Cairo timezone for date parsing
    const end = endDate ? parseDateToCairoEnd(endDate) : getCairoEndOfDay();
    const start = startDate ? parseDateToCairoStart(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let params = [tenantId, start.toISOString(), end.toISOString()];
    let storeFilter = '';
    if (storeId) {
      storeFilter = ' AND sr.store_id = $4';
      params.push(storeId);
    }
    
    // Overall profit metrics
    const profitMetrics = await pool.query(`
      SELECT 
        COALESCE(SUM(sl.line_total), 0) as total_revenue,
        COALESCE(SUM(sl.quantity * p.cost_price), 0) as total_cost,
        COALESCE(SUM(sl.line_total - (sl.quantity * p.cost_price)), 0) as gross_profit
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
    `, params);
    
    const metrics = profitMetrics.rows[0];
    const revenue = parseFloat(metrics.total_revenue) || 0;
    const cost = parseFloat(metrics.total_cost) || 0;
    const profit = parseFloat(metrics.gross_profit) || 0;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : 0;
    
    // Profit by product
    const profitByProduct = await pool.query(`
      SELECT 
        p.name,
        p.sku,
        SUM(sl.quantity) as units_sold,
        COALESCE(SUM(sl.line_total), 0) as revenue,
        COALESCE(SUM(sl.quantity * p.cost_price), 0) as cost,
        COALESCE(SUM(sl.line_total - (sl.quantity * p.cost_price)), 0) as profit
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY profit DESC
      LIMIT 10
    `, params);
    
    // Profit by category
    const profitByCategory = await pool.query(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category,
        COALESCE(SUM(sl.line_total), 0) as revenue,
        COALESCE(SUM(sl.quantity * p.cost_price), 0) as cost,
        COALESCE(SUM(sl.line_total - (sl.quantity * p.cost_price)), 0) as profit
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY c.id, c.name
      ORDER BY profit DESC
    `, params);
    
    // Daily profit trend
    const dailyProfit = await pool.query(`
      SELECT 
        DATE(sr.receipt_date) as date,
        COALESCE(SUM(sl.line_total), 0) as revenue,
        COALESCE(SUM(sl.quantity * p.cost_price), 0) as cost,
        COALESCE(SUM(sl.line_total - (sl.quantity * p.cost_price)), 0) as profit
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      WHERE sr.tenant_id = $1 
        AND sr.receipt_date >= $2 AND sr.receipt_date <= $3
        AND sr.status = 'completed'
        ${storeFilter}
      GROUP BY DATE(sr.receipt_date)
      ORDER BY date
    `, params);
    
    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      metrics: {
        totalRevenue: revenue,
        totalCost: cost,
        grossProfit: profit,
        marginPercent: margin,
      },
      profitByProduct: profitByProduct.rows,
      profitByCategory: profitByCategory.rows,
      dailyProfit: dailyProfit.rows,
    });
  } catch (error) {
    console.error('Profit report error:', error);
    res.status(500).json({ error: 'Failed to generate profit report' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Users - Get all users
app.get('/api/admin/users', authenticate, async (req, res) => {
  try {
    // Get users with their role from user_roles join
    const result = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.created_at, u.last_login_at as last_login,
              s.name as store_name, s.id as store_id,
              COALESCE(r.name, 'No Role') as role_name,
              COALESCE(r.id::text, 'none') as role
       FROM users u
       LEFT JOIN stores s ON s.id = u.default_store_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1
       ORDER BY u.created_at DESC`,
      [req.user.tenantId]
    );
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Users - Create new user
app.post('/api/admin/users', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { email, password, firstName, lastName, role, storeId } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, default_store_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, is_active, created_at`,
      [req.user.tenantId, email, hashedPassword, firstName, lastName, storeId || null]
    );
    
    const newUser = userResult.rows[0];
    
    // Find or create role and assign to user
    if (role) {
      let roleResult = await client.query(
        `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`,
        [req.user.tenantId, role]
      );
      
      let roleId;
      if (roleResult.rows.length === 0) {
        // Create the role
        const newRole = await client.query(
          `INSERT INTO roles (tenant_id, name, description, permissions) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [req.user.tenantId, role, `${role} role`, JSON.stringify([])]
        );
        roleId = newRole.rows[0].id;
      } else {
        roleId = roleResult.rows[0].id;
      }
      
      // Assign role to user
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newUser.id, roleId]
      );
    }
    
    // Log audit
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'CREATE', 'user', newUser.id, JSON.stringify({ email, role })]
    );
    
    await client.query('COMMIT');
    res.status(201).json({ user: { ...newUser, role } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create user error:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  } finally {
    client.release();
  }
});

// Users - Update user
app.put('/api/admin/users/:id', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, role, storeId, isActive } = req.body;
    const result = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, default_store_id = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6 RETURNING id, email, first_name, last_name, is_active`,
      [firstName, lastName, storeId || null, isActive, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'UPDATE', 'user', req.params.id, JSON.stringify({ role, isActive })]
    );
    
    res.json({ user: { ...result.rows[0], role } });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Users - Reset password
app.post('/api/admin/users/:id/reset-password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 RETURNING id`,
      [hashedPassword, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'PASSWORD_RESET', 'user', req.params.id, JSON.stringify({ by: req.user.userId })]
    );
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Users - Delete (soft)
app.delete('/api/admin/users/:id', authenticate, async (req, res) => {
  try {
    // Don't allow deleting yourself
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const result = await pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'DELETE', 'user', req.params.id, JSON.stringify({})]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Stores - Get all stores
app.get('/api/admin/stores', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM users u WHERE u.default_store_id = s.id) as user_count,
              (SELECT COUNT(*) FROM products p WHERE p.tenant_id = s.tenant_id) as product_count
       FROM stores s
       WHERE s.tenant_id = $1
       ORDER BY s.name`,
      [req.user.tenantId]
    );
    res.json({ stores: result.rows });
  } catch (error) {
    console.error('Get stores error:', error);
    res.status(500).json({ error: 'Failed to get stores' });
  }
});

// Stores - Create store (with store limit enforcement)
app.post('/api/admin/stores', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, code, address, phone, email, isActive } = req.body;
    
    await client.query('BEGIN');
    
    // Check store limit with row lock to prevent concurrent bypass
    const tenantResult = await client.query(
      `SELECT store_limit FROM tenants WHERE id = $1 FOR UPDATE`,
      [req.user.tenantId]
    );
    
    if (tenantResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const storeLimit = tenantResult.rows[0].store_limit;
    
    // Get current active store count
    const countResult = await client.query(
      `SELECT COUNT(*)::INTEGER as count FROM stores WHERE tenant_id = $1 AND is_active = true`,
      [req.user.tenantId]
    );
    const activeStoreCount = countResult.rows[0].count;
    
    // Enforce store limit (NULL = unlimited)
    if (storeLimit !== null && activeStoreCount >= storeLimit) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: 'STORE_LIMIT_REACHED',
        message: 'Store limit reached. Please contact the administrator to increase your plan limit.',
        currentCount: activeStoreCount,
        limit: storeLimit
      });
    }
    
    const storeCode = code || name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const result = await client.query(
      `INSERT INTO stores (tenant_id, name, code, address, phone, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.tenantId, name, storeCode, address || null, phone || null, email || null, isActive !== false]
    );
    
    // Log audit
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'CREATE', 'store', result.rows[0].id, JSON.stringify({ name })]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ store: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create store error:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Store code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create store' });
    }
  } finally {
    client.release();
  }
});

// Stores - Update store
app.put('/api/admin/stores/:id', authenticate, async (req, res) => {
  try {
    const { name, code, address, phone, email, isActive } = req.body;
    const result = await pool.query(
      `UPDATE stores SET name = $1, code = $2, address = $3, phone = $4, email = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, code, address || null, phone || null, email || null, isActive, req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'UPDATE', 'store', req.params.id, JSON.stringify({ name })]
    );
    
    res.json({ store: result.rows[0] });
  } catch (error) {
    console.error('Update store error:', error);
    res.status(500).json({ error: 'Failed to update store' });
  }
});

// Stores - Delete (soft)
app.delete('/api/admin/stores/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE stores SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete store error:', error);
    res.status(500).json({ error: 'Failed to delete store' });
  }
});

// Roles - Get all roles
app.get('/api/admin/roles', authenticate, async (req, res) => {
  try {
    // Get roles from database
    const rolesResult = await pool.query(
      `SELECT r.id, r.name, r.description, r.permissions,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) as user_count
       FROM roles r
       WHERE r.tenant_id = $1
       ORDER BY r.name`,
      [req.user.tenantId]
    );
    
    // If no roles exist, return default predefined roles
    let roles = rolesResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      permissions: r.permissions || [],
      userCount: parseInt(r.user_count) || 0
    }));
    
    // Add default roles if none exist
    if (roles.length === 0) {
      roles = [
        { id: 'admin', name: 'Administrator', description: 'Full system access', permissions: ['all'], userCount: 0 },
        { id: 'manager', name: 'Store Manager', description: 'Manage store operations, inventory, and reports', permissions: ['pos', 'inventory', 'reports', 'customers', 'products.view', 'products.edit'], userCount: 0 },
        { id: 'cashier', name: 'Cashier', description: 'POS operations and basic customer management', permissions: ['pos', 'customers.view', 'products.view'], userCount: 0 },
        { id: 'inventory', name: 'Inventory Staff', description: 'Manage stock and inventory operations', permissions: ['inventory', 'products.view', 'reports.inventory'], userCount: 0 }
      ];
    }
    
    res.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

// Settings - Get tenant settings
app.get('/api/admin/settings', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [req.user.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tenant = result.rows[0];
    const settings = tenant.settings || {};
    
    res.json({
      settings: {
        companyName: tenant.name,
        currencyCode: tenant.currency_code || 'EGP',
        timezone: tenant.timezone || 'Africa/Cairo',
        taxRate: settings.tax_rate || 14,
        receiptFooter: settings.receipt_footer || 'Thank you for your business!',
        lowStockThreshold: settings.low_stock_threshold || 10,
        allowNegativeStock: settings.allow_negative_stock || false,
        requireCustomer: settings.require_customer || false,
        autoGenerateSku: settings.auto_generate_sku !== false,
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Settings - Update tenant settings
app.put('/api/admin/settings', authenticate, async (req, res) => {
  try {
    const { companyName, currencyCode, timezone, taxRate, receiptFooter, lowStockThreshold, allowNegativeStock, requireCustomer, autoGenerateSku } = req.body;
    
    // Build settings JSONB object
    const settingsObj = {
      tax_rate: taxRate,
      receipt_footer: receiptFooter,
      low_stock_threshold: lowStockThreshold,
      allow_negative_stock: allowNegativeStock,
      require_customer: requireCustomer,
      auto_generate_sku: autoGenerateSku
    };
    
    const result = await pool.query(
      `UPDATE tenants SET 
        name = COALESCE($1, name),
        currency_code = COALESCE($2, currency_code),
        timezone = COALESCE($3, timezone),
        settings = settings || $4::jsonb,
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [companyName, currencyCode, timezone, JSON.stringify(settingsObj), req.user.tenantId]
    );
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.tenantId, req.user.userId, 'UPDATE', 'settings', req.user.tenantId, JSON.stringify(req.body)]
    );
    
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Audit Logs - Get logs
app.get('/api/admin/audit-logs', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, action, entityType, userId, limit = 100 } = req.query;
    
    let query = `
      SELECT al.*, u.email as user_email, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.tenant_id = $1
    `;
    const params = [req.user.tenantId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }
    if (entityType) {
      query += ` AND al.entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }
    if (userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Dashboard stats for admin
app.get('/api/admin/stats', authenticate, async (req, res) => {
  try {
    const [users, stores, products, sales] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true`, [req.user.tenantId]),
      pool.query(`SELECT COUNT(*) as count FROM stores WHERE tenant_id = $1 AND is_active = true`, [req.user.tenantId]),
      pool.query(`SELECT COUNT(*) as count FROM products WHERE tenant_id = $1 AND is_active = true`, [req.user.tenantId]),
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM sales_receipts WHERE tenant_id = $1 AND status = 'completed'`, [req.user.tenantId])
    ]);
    
    res.json({
      userCount: parseInt(users.rows[0].count),
      storeCount: parseInt(stores.rows[0].count),
      productCount: parseInt(products.rows[0].count),
      salesCount: parseInt(sales.rows[0].count),
      totalRevenue: parseFloat(sales.rows[0].total)
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to get admin stats' });
  }
});

// ============================================
// DOCUMENT CENTER - PDF GENERATION
// ============================================

// Generate Sales Receipt PDF
app.get('/api/documents/receipt/:receiptId', authenticate, async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { format = 'thermal', reprint = 'false' } = req.query;
    const tenantId = req.user.tenantId;
    
    // Fetch receipt with all related data
    const receiptResult = await pool.query(`
      SELECT sr.*, s.name as store_name, s.address as store_address, s.phone as store_phone,
             u.first_name || ' ' || COALESCE(u.last_name, '') as cashier_name,
             c.first_name as customer_first_name, c.last_name as customer_last_name,
             c.phone as customer_phone, c.email as customer_email
      FROM sales_receipts sr
      LEFT JOIN stores s ON s.id = sr.store_id
      LEFT JOIN users u ON u.id = sr.cashier_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.id = $1 AND sr.tenant_id = $2
    `, [receiptId, tenantId]);
    
    if (receiptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    
    const receipt = receiptResult.rows[0];
    
    // Fetch receipt items
    const itemsResult = await pool.query(`
      SELECT sl.*, p.sku
      FROM sales_lines sl
      LEFT JOIN products p ON p.id = sl.product_id
      WHERE sl.receipt_id = $1
      ORDER BY sl.line_number
    `, [receiptId]);
    
    // Fetch tenant settings
    const tenantResult = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    const tenant = tenantResult.rows[0];
    
    // Parse payments from JSONB
    const payments = receipt.payments || [];
    
    // Prepare data for PDF
    const pdfData = {
      store: {
        id: receipt.store_id,
        name: receipt.store_name,
        address: receipt.store_address,
        phone: receipt.store_phone
      },
      receipt: {
        id: receipt.id,
        receipt_number: receipt.receipt_number,
        receipt_date: receipt.receipt_date,
        type: receipt.type || 'sale',
        subtotal: receipt.subtotal,
        discount_amount: receipt.discount_amount,
        tax_amount: receipt.tax_amount,
        total_amount: receipt.total_amount,
        paid_amount: receipt.paid_amount,
        change_amount: receipt.change_amount,
        status: receipt.status
      },
      items: itemsResult.rows,
      payments: payments,
      customer: receipt.customer_first_name ? {
        first_name: receipt.customer_first_name,
        last_name: receipt.customer_last_name,
        phone: receipt.customer_phone,
        email: receipt.customer_email
      } : null,
      cashier: { name: receipt.cashier_name },
      tenant: {
        name: tenant?.name,
        currency_code: tenant?.currency_code || 'EGP',
        settings: tenant?.settings || {}
      }
    };
    
    const pdfFormat = format === 'a4' ? FORMAT_TYPES.A4 : FORMAT_TYPES.THERMAL;
    const isReprint = reprint === 'true';
    
    const pdfBuffer = await generateDocument(
      DOCUMENT_TYPES.SALES_RECEIPT,
      pdfData,
      pdfFormat,
      { isReprint }
    );
    
    // Log document generation for audit
    await pool.query(`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, req.user.userId, isReprint ? 'REPRINT' : 'PRINT', 'receipt', receiptId, JSON.stringify({ format, reprint: isReprint })]);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${receipt.receipt_number}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Generate receipt PDF error:', error);
    res.status(500).json({ error: 'Failed to generate receipt PDF' });
  }
});

// Generate GRN Proof PDF
app.get('/api/documents/grn/:grnId', authenticate, async (req, res) => {
  try {
    const { grnId } = req.params;
    const { format = 'a4' } = req.query;
    const tenantId = req.user.tenantId;
    
    // Fetch GRN with related data
    const grnResult = await pool.query(`
      SELECT g.*, s.name as store_name, s.address as store_address,
             sup.name as supplier_name, sup.code as supplier_code, sup.phone as supplier_phone,
             u.first_name || ' ' || COALESCE(u.last_name, '') as received_by_name
      FROM grns g
      LEFT JOIN stores s ON s.id = g.store_id
      LEFT JOIN suppliers sup ON sup.id = g.supplier_id
      LEFT JOIN users u ON u.id = g.received_by
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [grnId, tenantId]);
    
    if (grnResult.rows.length === 0) {
      return res.status(404).json({ error: 'GRN not found' });
    }
    
    const grn = grnResult.rows[0];
    
    // Fetch GRN items
    const itemsResult = await pool.query(`
      SELECT gl.*, p.sku, p.name
      FROM grn_lines gl
      LEFT JOIN products p ON p.id = gl.product_id
      WHERE gl.grn_id = $1
      ORDER BY gl.line_number
    `, [grnId]);
    
    // Fetch tenant
    const tenantResult = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    const tenant = tenantResult.rows[0];
    
    const pdfData = {
      grn: grn,
      items: itemsResult.rows,
      supplier: {
        name: grn.supplier_name,
        code: grn.supplier_code,
        phone: grn.supplier_phone
      },
      store: {
        name: grn.store_name,
        address: grn.store_address
      },
      user: { name: grn.received_by_name },
      tenant: {
        name: tenant?.name,
        currency_code: tenant?.currency_code || 'EGP'
      }
    };
    
    const pdfFormat = format === 'thermal' ? FORMAT_TYPES.THERMAL : FORMAT_TYPES.A4;
    const pdfBuffer = await generateDocument(DOCUMENT_TYPES.GRN_PROOF, pdfData, pdfFormat);
    
    // Audit log
    await pool.query(`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, req.user.userId, 'DOWNLOAD', 'grn', grnId, JSON.stringify({ format })]);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="grn-${grn.grn_number}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Generate GRN PDF error:', error);
    res.status(500).json({ error: 'Failed to generate GRN PDF' });
  }
});

// Generate Transfer Note PDF
app.get('/api/documents/transfer/:transferId', authenticate, async (req, res) => {
  try {
    const { transferId } = req.params;
    const { format = 'a4' } = req.query;
    const tenantId = req.user.tenantId;
    
    // Fetch transfer with related data
    const transferResult = await pool.query(`
      SELECT t.*, 
             fs.name as from_store_name, fs.address as from_store_address,
             ts.name as to_store_name, ts.address as to_store_address,
             u.first_name || ' ' || COALESCE(u.last_name, '') as created_by_name
      FROM stock_transfers t
      LEFT JOIN stores fs ON fs.id = t.from_store_id
      LEFT JOIN stores ts ON ts.id = t.to_store_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = $1 AND t.tenant_id = $2
    `, [transferId, tenantId]);
    
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const transfer = transferResult.rows[0];
    
    // Fetch transfer items
    const itemsResult = await pool.query(`
      SELECT tl.*, p.sku, p.name, u.symbol as uom
      FROM stock_transfer_lines tl
      LEFT JOIN products p ON p.id = tl.product_id
      LEFT JOIN uoms u ON u.id = tl.uom_id
      WHERE tl.transfer_id = $1
      ORDER BY tl.line_number
    `, [transferId]);
    
    // Fetch tenant
    const tenantResult = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    const tenant = tenantResult.rows[0];
    
    const pdfData = {
      transfer: {
        ...transfer,
        transfer_number: transfer.transfer_number,
        timeline: transfer.timeline || []
      },
      items: itemsResult.rows,
      fromStore: {
        name: transfer.from_store_name,
        address: transfer.from_store_address
      },
      toStore: {
        name: transfer.to_store_name,
        address: transfer.to_store_address
      },
      user: { name: transfer.created_by_name },
      tenant: { name: tenant?.name }
    };
    
    const pdfFormat = format === 'thermal' ? FORMAT_TYPES.THERMAL : FORMAT_TYPES.A4;
    const pdfBuffer = await generateDocument(DOCUMENT_TYPES.TRANSFER_NOTE, pdfData, pdfFormat);
    
    // Audit log
    await pool.query(`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, req.user.userId, 'DOWNLOAD', 'transfer', transferId, JSON.stringify({ format })]);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="transfer-${transfer.transfer_number}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Generate transfer PDF error:', error);
    res.status(500).json({ error: 'Failed to generate transfer PDF' });
  }
});

// Get receipts list with search/filter
app.get('/api/receipts', authenticate, async (req, res) => {
  try {
    const { storeId, startDate, endDate, search, status, paymentMethod, type, limit = 50, offset = 0 } = req.query;
    const tenantId = req.user.tenantId;
    
    let query = `
      SELECT sr.id, sr.receipt_number, sr.receipt_date, sr.total_amount, sr.status, sr.type,
             sr.payments, sr.customer_id,
             s.name as store_name,
             u.first_name || ' ' || COALESCE(u.last_name, '') as cashier_name,
             c.first_name || ' ' || COALESCE(c.last_name, '') as customer_name,
             c.phone as customer_phone
      FROM sales_receipts sr
      LEFT JOIN stores s ON s.id = sr.store_id
      LEFT JOIN users u ON u.id = sr.cashier_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;
    
    if (storeId) {
      query += ` AND sr.store_id = $${paramIndex}`;
      params.push(storeId);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND sr.receipt_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND sr.receipt_date <= $${paramIndex}`;
      params.push(endDate + ' 23:59:59');
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (sr.receipt_number ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.first_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND sr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (type) {
      query += ` AND sr.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    query += ` ORDER BY sr.receipt_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM sales_receipts sr LEFT JOIN customers c ON c.id = sr.customer_id WHERE sr.tenant_id = $1`;
    const countParams = [tenantId];
    // Apply same filters for count
    
    res.json({
      receipts: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Failed to get receipts' });
  }
});

// ============================================
// SUPER ADMIN ENDPOINTS
// ============================================

// Get all tenants (Super Admin only)
app.get('/api/super-admin/tenants', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*)::INTEGER FROM stores WHERE tenant_id = t.id AND is_active = true) as active_store_count,
        (SELECT u.email FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at LIMIT 1) as admin_email,
        (SELECT u.first_name || ' ' || COALESCE(u.last_name, '') FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at LIMIT 1) as admin_name
      FROM tenants t
      ORDER BY t.created_at DESC
    `);
    res.json({ tenants: result.rows });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ error: 'Failed to get tenants' });
  }
});

// Get single tenant details (Super Admin only)
app.get('/api/super-admin/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenantResult = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*)::INTEGER FROM stores WHERE tenant_id = t.id AND is_active = true) as active_store_count
      FROM tenants t WHERE t.id = $1
    `, [tenantId]);
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const usersResult = await pool.query(`
      SELECT id, email, first_name, last_name, is_active, last_login_at, created_at
      FROM users WHERE tenant_id = $1 ORDER BY created_at
    `, [tenantId]);
    
    const storesResult = await pool.query(`
      SELECT id, code, name, is_active, created_at
      FROM stores WHERE tenant_id = $1 ORDER BY created_at
    `, [tenantId]);
    
    res.json({
      tenant: tenantResult.rows[0],
      users: usersResult.rows,
      stores: storesResult.rows
    });
  } catch (error) {
    console.error('Get tenant details error:', error);
    res.status(500).json({ error: 'Failed to get tenant details' });
  }
});

// Create new tenant with admin user (Super Admin only)
app.post('/api/super-admin/tenants', requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { tenantName, adminEmail, adminPassword, adminFirstName, adminLastName, storeLimit, currency = 'EGP' } = req.body;
    
    if (!tenantName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'Tenant name, admin email, and password are required' });
    }
    
    await client.query('BEGIN');
    
    // Check if email already exists
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Create tenant
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug, currency_code, store_limit, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [tenantName, tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), currency, storeLimit || null]);
    const tenant = tenantResult.rows[0];
    
    // Create default store
    const storeResult = await client.query(`
      INSERT INTO stores (tenant_id, code, name)
      VALUES ($1, 'MAIN', 'Main Store')
      RETURNING *
    `, [tenant.id]);
    const store = storeResult.rows[0];
    
    // Create admin role
    const roleResult = await client.query(`
      INSERT INTO roles (tenant_id, name, permissions, is_system)
      VALUES ($1, 'Admin', $2, true)
      RETURNING *
    `, [tenant.id, JSON.stringify(['*'])]);
    const role = roleResult.rows[0];
    
    // Create admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const userResult = await client.query(`
      INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, default_store_id, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [tenant.id, adminEmail, passwordHash, adminFirstName || 'Admin', adminLastName || '', store.id]);
    const user = userResult.rows[0];
    
    // Assign role and store
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [user.id, role.id]);
    await client.query('INSERT INTO user_stores (user_id, store_id, is_default) VALUES ($1, $2, true)', [user.id, store.id]);
    
    // Create default tax group
    await client.query(`
      INSERT INTO tax_groups (tenant_id, code, name, rate, is_default) VALUES ($1, 'STD', 'Standard', 0.14, true)
    `, [tenant.id]);
    
    // Create default UoM
    await client.query(`
      INSERT INTO uoms (tenant_id, code, name, is_base) VALUES ($1, 'EA', 'Each', true)
    `, [tenant.id]);
    
    // Audit log
    await client.query(`
      INSERT INTO super_admin_audit_logs (actor_user_id, action, target_type, target_id, metadata)
      VALUES ($1, 'CREATE_TENANT', 'tenant', $2, $3)
    `, [req.user.userId, tenant.id, JSON.stringify({ tenantName, adminEmail, storeLimit })]);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      tenant: { ...tenant, active_store_count: 1 },
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name },
      store: { id: store.id, code: store.code, name: store.name }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant: ' + error.message });
  } finally {
    client.release();
  }
});

// Update tenant (store limit, status) - Super Admin only
app.patch('/api/super-admin/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { storeLimit, status, name } = req.body;
    
    const updates = [];
    const params = [tenantId];
    let paramIndex = 2;
    
    if (storeLimit !== undefined) {
      updates.push(`store_limit = $${paramIndex}`);
      params.push(storeLimit === 'unlimited' ? null : parseInt(storeLimit));
      paramIndex++;
    }
    
    if (status) {
      if (!['active', 'suspended', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (name) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await pool.query(`
      UPDATE tenants SET ${updates.join(', ')} WHERE id = $1 RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Audit log
    await pool.query(`
      INSERT INTO super_admin_audit_logs (actor_user_id, action, target_type, target_id, metadata)
      VALUES ($1, 'UPDATE_TENANT', 'tenant', $2, $3)
    `, [req.user.userId, tenantId, JSON.stringify(req.body)]);
    
    res.json({ tenant: result.rows[0] });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Reset tenant admin password (Super Admin only)
app.post('/api/super-admin/tenants/:tenantId/reset-password', requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { userId, newPassword } = req.body;
    
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'User ID and new password are required' });
    }
    
    // Verify user belongs to tenant
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in this tenant' });
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query(`
      UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2
    `, [passwordHash, userId]);
    
    // Audit log
    await pool.query(`
      INSERT INTO super_admin_audit_logs (actor_user_id, action, target_type, target_id, metadata)
      VALUES ($1, 'RESET_PASSWORD', 'user', $2, $3)
    `, [req.user.userId, userId, JSON.stringify({ tenantId })]);
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get Super Admin audit logs
app.get('/api/super-admin/audit-logs', requireSuperAdmin, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await pool.query(`
      SELECT sal.*, u.email as actor_email, u.first_name as actor_name
      FROM super_admin_audit_logs sal
      LEFT JOIN users u ON u.id = sal.actor_user_id
      ORDER BY sal.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// ============================================
// SHIFTS API
// ============================================

// Get all shifts for store
app.get('/api/shifts', authenticate, async (req, res) => {
  try {
    const { storeId, status, limit = 50 } = req.query;
    
    let query = `
      SELECT s.*, 
        u.first_name as cashier_first_name, 
        u.last_name as cashier_last_name,
        u.email as cashier_email,
        st.name as store_name,
        (SELECT COUNT(*) FROM sales_receipts sr WHERE sr.shift_id = s.id) as receipt_count
      FROM shifts s
      JOIN users u ON u.id = s.cashier_id
      JOIN stores st ON st.id = s.store_id
      WHERE s.tenant_id = $1
    `;
    const params = [req.user.tenantId];
    let paramIndex = 2;
    
    if (storeId) {
      query += ` AND s.store_id = $${paramIndex}`;
      params.push(storeId);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY s.opened_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json({ shifts: result.rows });
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to get shifts' });
  }
});

// Get current open shift for user
app.get('/api/shifts/current', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    
    const result = await pool.query(`
      SELECT s.*, 
        u.first_name as cashier_first_name,
        u.last_name as cashier_last_name,
        st.name as store_name,
        (SELECT COALESCE(SUM(amount), 0) FROM shift_cash_movements WHERE shift_id = s.id AND type = 'cash_in') as total_cash_in,
        (SELECT COALESCE(SUM(amount), 0) FROM shift_cash_movements WHERE shift_id = s.id AND type = 'cash_out') as total_cash_out
      FROM shifts s
      JOIN users u ON u.id = s.cashier_id
      JOIN stores st ON st.id = s.store_id
      WHERE s.tenant_id = $1 
        AND s.cashier_id = $2 
        AND s.store_id = $3
        AND s.status = 'open'
      ORDER BY s.opened_at DESC
      LIMIT 1
    `, [req.user.tenantId, req.user.userId, storeId]);
    
    if (result.rows.length === 0) {
      return res.json({ shift: null });
    }
    
    res.json({ shift: result.rows[0] });
  } catch (error) {
    console.error('Get current shift error:', error);
    res.status(500).json({ error: 'Failed to get current shift' });
  }
});

// Get shift details with cash movements
app.get('/api/shifts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const shiftResult = await pool.query(`
      SELECT s.*, 
        u.first_name as cashier_first_name, 
        u.last_name as cashier_last_name,
        u.email as cashier_email,
        st.name as store_name
      FROM shifts s
      JOIN users u ON u.id = s.cashier_id
      JOIN stores st ON st.id = s.store_id
      WHERE s.id = $1 AND s.tenant_id = $2
    `, [id, req.user.tenantId]);
    
    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    // Get cash movements
    const movementsResult = await pool.query(`
      SELECT m.*, u.first_name as created_by_name
      FROM shift_cash_movements m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.shift_id = $1
      ORDER BY m.created_at ASC
    `, [id]);
    
    // Get sales summary
    const salesResult = await pool.query(`
      SELECT 
        COUNT(*) as receipt_count,
        COALESCE(SUM(CASE WHEN type = 'sale' THEN total_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN total_amount ELSE 0 END), 0) as total_refunds
      FROM sales_receipts
      WHERE shift_id = $1 AND status = 'completed'
    `, [id]);
    
    res.json({
      shift: shiftResult.rows[0],
      movements: movementsResult.rows,
      salesSummary: salesResult.rows[0]
    });
  } catch (error) {
    console.error('Get shift details error:', error);
    res.status(500).json({ error: 'Failed to get shift details' });
  }
});

// Open a new shift
app.post('/api/shifts/open', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { storeId, openingCash, registerId, notes } = req.body;
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    await client.query('BEGIN');
    
    // Check if user already has an open shift at this store
    const existingShift = await client.query(`
      SELECT id FROM shifts 
      WHERE tenant_id = $1 AND cashier_id = $2 AND store_id = $3 AND status = 'open'
    `, [req.user.tenantId, req.user.userId, storeId]);
    
    if (existingShift.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You already have an open shift at this store' });
    }
    
    // Generate shift number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(`
      SELECT COUNT(*) + 1 as num FROM shifts 
      WHERE tenant_id = $1 AND store_id = $2 AND DATE(opened_at) = CURRENT_DATE
    `, [req.user.tenantId, storeId]);
    const shiftNumber = `SH-${dateStr}-${String(countResult.rows[0].num).padStart(3, '0')}`;
    
    // Create the shift
    const result = await client.query(`
      INSERT INTO shifts (
        tenant_id, store_id, cashier_id, register_id, shift_number,
        opening_cash, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
      RETURNING *
    `, [
      req.user.tenantId,
      storeId,
      req.user.userId,
      registerId || null,
      shiftNumber,
      parseFloat(openingCash) || 0,
      notes || null
    ]);
    
    // Log audit
    await client.query(`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, 'OPEN_SHIFT', 'shift', $3, $4)
    `, [req.user.tenantId, req.user.userId, result.rows[0].id, JSON.stringify({ openingCash })]);
    
    await client.query('COMMIT');
    
    res.status(201).json({ shift: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Open shift error:', error);
    res.status(500).json({ error: 'Failed to open shift' });
  } finally {
    client.release();
  }
});

// Close a shift
app.post('/api/shifts/:id/close', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { closingCash, notes } = req.body;
    
    await client.query('BEGIN');
    
    // Get the shift
    const shiftResult = await client.query(`
      SELECT * FROM shifts WHERE id = $1 AND tenant_id = $2 AND status = 'open'
    `, [id, req.user.tenantId]);
    
    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Open shift not found' });
    }
    
    const shift = shiftResult.rows[0];
    
    // Calculate totals from sales
    const salesResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'sale' THEN total_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN total_amount ELSE 0 END), 0) as total_refunds,
        COUNT(*) as transaction_count
      FROM sales_receipts
      WHERE shift_id = $1 AND status = 'completed'
    `, [id]);
    
    // Calculate cash payments
    const cashPaymentsResult = await client.query(`
      SELECT COALESCE(SUM(
        (SELECT SUM((p->>'amount')::decimal) 
         FROM jsonb_array_elements(payments) p 
         WHERE p->>'method' = 'cash')
      ), 0) as cash_total,
      COALESCE(SUM(
        (SELECT SUM((p->>'amount')::decimal) 
         FROM jsonb_array_elements(payments) p 
         WHERE p->>'method' = 'card')
      ), 0) as card_total
      FROM sales_receipts
      WHERE shift_id = $1 AND status = 'completed' AND type = 'sale'
    `, [id]);
    
    // Get cash movements
    const movementsResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type IN ('cash_in', 'pickup') THEN amount ELSE 0 END), 0) as cash_in,
        COALESCE(SUM(CASE WHEN type IN ('cash_out', 'drop') THEN amount ELSE 0 END), 0) as cash_out
      FROM shift_cash_movements
      WHERE shift_id = $1
    `, [id]);
    
    const totalSales = parseFloat(salesResult.rows[0].total_sales) || 0;
    const totalRefunds = parseFloat(salesResult.rows[0].total_refunds) || 0;
    const transactionCount = parseInt(salesResult.rows[0].transaction_count) || 0;
    const totalCashPayments = parseFloat(cashPaymentsResult.rows[0].cash_total) || 0;
    const totalCardPayments = parseFloat(cashPaymentsResult.rows[0].card_total) || 0;
    const cashIn = parseFloat(movementsResult.rows[0].cash_in) || 0;
    const cashOut = parseFloat(movementsResult.rows[0].cash_out) || 0;
    
    const openingCash = parseFloat(shift.opening_cash) || 0;
    const actualClosingCash = parseFloat(closingCash) || 0;
    
    // Expected = Opening + Cash Sales + Cash In - Cash Out - Refunds (cash portion)
    const expectedCash = openingCash + totalCashPayments + cashIn - cashOut;
    const cashDifference = actualClosingCash - expectedCash;
    
    // Update the shift
    const updateResult = await client.query(`
      UPDATE shifts SET
        closed_at = NOW(),
        closing_cash = $1,
        expected_cash = $2,
        cash_difference = $3,
        total_sales = $4,
        total_refunds = $5,
        total_cash_payments = $6,
        total_card_payments = $7,
        transaction_count = $8,
        notes = COALESCE($9, notes),
        status = 'closed',
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      actualClosingCash,
      expectedCash,
      cashDifference,
      totalSales,
      totalRefunds,
      totalCashPayments,
      totalCardPayments,
      transactionCount,
      notes,
      id
    ]);
    
    // Log audit
    await client.query(`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, 'CLOSE_SHIFT', 'shift', $3, $4)
    `, [req.user.tenantId, req.user.userId, id, JSON.stringify({
      closingCash: actualClosingCash,
      expectedCash,
      cashDifference,
      totalSales,
      transactionCount
    })]);
    
    await client.query('COMMIT');
    
    res.json({ 
      shift: updateResult.rows[0],
      summary: {
        openingCash,
        closingCash: actualClosingCash,
        expectedCash,
        cashDifference,
        totalSales,
        totalRefunds,
        totalCashPayments,
        totalCardPayments,
        transactionCount,
        cashIn,
        cashOut
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Close shift error:', error);
    res.status(500).json({ error: 'Failed to close shift' });
  } finally {
    client.release();
  }
});

// Add cash movement to shift
app.post('/api/shifts/:id/movements', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, reason, notes } = req.body;
    
    if (!['cash_in', 'cash_out', 'drop', 'pickup'].includes(type)) {
      return res.status(400).json({ error: 'Invalid movement type' });
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    
    // Verify shift exists and is open
    const shiftCheck = await pool.query(`
      SELECT id FROM shifts WHERE id = $1 AND tenant_id = $2 AND status = 'open'
    `, [id, req.user.tenantId]);
    
    if (shiftCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Open shift not found' });
    }
    
    const result = await pool.query(`
      INSERT INTO shift_cash_movements (tenant_id, shift_id, type, amount, reason, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.tenantId, id, type, parseFloat(amount), reason || null, notes || null, req.user.userId]);
    
    res.status(201).json({ movement: result.rows[0] });
  } catch (error) {
    console.error('Add cash movement error:', error);
    res.status(500).json({ error: 'Failed to add cash movement' });
  }
});

// Get shift cash movements
app.get('/api/shifts/:id/movements', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT m.*, u.first_name as created_by_name, u.last_name as created_by_last_name
      FROM shift_cash_movements m
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.shift_id = $1 AND m.tenant_id = $2
      ORDER BY m.created_at ASC
    `, [id, req.user.tenantId]);
    
    res.json({ movements: result.rows });
  } catch (error) {
    console.error('Get movements error:', error);
    res.status(500).json({ error: 'Failed to get movements' });
  }
});

// =====================================================
// DEMAND FORECASTING & STOCK RECOMMENDATIONS
// =====================================================

// Get demand forecast and stock recommendations for a store
app.get('/api/forecasting/recommendations', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    const tenantId = req.user.tenantId;
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    // Get sales data for the last 30 days to calculate average daily demand
    const salesData = await pool.query(`
      SELECT 
        sl.product_id,
        p.name as product_name,
        p.sku,
        c.name as category,
        DATE(sr.receipt_date + INTERVAL '2 hours') as sale_date,
        SUM(sl.quantity) as daily_quantity,
        SUM(sl.line_total) as daily_revenue
      FROM sales_lines sl
      JOIN sales_receipts sr ON sr.id = sl.receipt_id
      JOIN products p ON p.id = sl.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE sl.tenant_id = $1 
        AND sr.store_id = $2
        AND sr.status = 'completed'
        AND sr.receipt_date >= NOW() - INTERVAL '30 days'
      GROUP BY sl.product_id, p.name, p.sku, c.name, DATE(sr.receipt_date + INTERVAL '2 hours')
      ORDER BY sl.product_id, sale_date
    `, [tenantId, storeId]);
    
    // Get current stock levels - include ALL products, not just those in stock_on_hand
    const stockLevels = await pool.query(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        c.name as category,
        p.reorder_point,
        p.cost_price,
        COALESCE(soh.quantity, 0) as current_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_on_hand soh ON soh.product_id = p.id AND soh.store_id = $2 AND soh.tenant_id = $1
      WHERE p.tenant_id = $1 AND p.is_active = true
    `, [tenantId, storeId]);
    
    console.log('Forecasting debug:', { tenantId, storeId, productsFound: stockLevels.rows.length });
    
    // Calculate demand statistics for each product
    const productStats = new Map();
    
    // Group sales by product
    for (const sale of salesData.rows) {
      if (!productStats.has(sale.product_id)) {
        productStats.set(sale.product_id, {
          product_id: sale.product_id,
          product_name: sale.product_name,
          sku: sale.sku,
          category: sale.category,
          daily_sales: [],
          total_quantity: 0,
          total_revenue: 0,
          days_with_sales: 0
        });
      }
      const stats = productStats.get(sale.product_id);
      stats.daily_sales.push(parseFloat(sale.daily_quantity));
      stats.total_quantity += parseFloat(sale.daily_quantity);
      stats.total_revenue += parseFloat(sale.daily_revenue);
      stats.days_with_sales++;
    }
    
    // Calculate forecasts and recommendations
    const recommendations = [];
    const stockMap = new Map(stockLevels.rows.map(s => [s.product_id, s]));
    
    for (const [productId, stats] of productStats) {
      const stock = stockMap.get(productId) || { current_stock: 0, reorder_point: 5, cost_price: 0 };
      
      // Calculate average daily demand (using all 30 days, treating days without sales as 0)
      const avgDailyDemand = stats.total_quantity / 30;
      
      // Calculate standard deviation for variability
      const dailySalesWithZeros = [...stats.daily_sales];
      while (dailySalesWithZeros.length < 30) dailySalesWithZeros.push(0);
      const mean = avgDailyDemand;
      const squaredDiffs = dailySalesWithZeros.map(x => Math.pow(x - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / 30;
      const stdDev = Math.sqrt(variance);
      
      // Forecast tomorrow's demand (average + safety factor based on variability)
      const safetyFactor = 1.5; // 1.5 standard deviations for safety stock
      const forecastedDemand = Math.ceil(avgDailyDemand + (stdDev * safetyFactor));
      
      // Calculate days of stock remaining
      const daysOfStock = avgDailyDemand > 0 ? Math.floor(stock.current_stock / avgDailyDemand) : 999;
      
      // Determine recommendation
      let recommendation = null;
      let urgency = 'normal';
      let suggestedQuantity = 0;
      
      if (stock.current_stock <= 0) {
        urgency = 'critical';
        suggestedQuantity = Math.max(forecastedDemand * 7, stock.reorder_point || 10); // 7 days supply
        recommendation = 'OUT_OF_STOCK';
      } else if (stock.current_stock < forecastedDemand) {
        urgency = 'critical';
        suggestedQuantity = Math.max(forecastedDemand * 7 - stock.current_stock, 0);
        recommendation = 'STOCK_BELOW_DEMAND';
      } else if (daysOfStock <= 3) {
        urgency = 'high';
        suggestedQuantity = Math.max(forecastedDemand * 7 - stock.current_stock, 0);
        recommendation = 'LOW_STOCK_DAYS';
      } else if (stock.current_stock <= (stock.reorder_point || 5)) {
        urgency = 'medium';
        suggestedQuantity = Math.max(forecastedDemand * 14 - stock.current_stock, 0);
        recommendation = 'BELOW_REORDER_POINT';
      }
      
      if (recommendation) {
        recommendations.push({
          product_id: productId,
          product_name: stats.product_name,
          sku: stats.sku,
          category: stats.category,
          current_stock: parseFloat(stock.current_stock) || 0,
          reorder_point: stock.reorder_point || 5,
          avg_daily_demand: Math.round(avgDailyDemand * 100) / 100,
          forecasted_demand: forecastedDemand,
          days_of_stock: daysOfStock,
          urgency,
          recommendation,
          suggested_quantity: Math.ceil(suggestedQuantity),
          estimated_cost: Math.round((suggestedQuantity * (stock.cost_price || 0)) * 100) / 100,
          trend: stats.days_with_sales >= 7 ? 'stable' : 'insufficient_data'
        });
      }
    }
    
    // Also check products not in sales data
    for (const stock of stockLevels.rows) {
      if (!productStats.has(stock.product_id)) {
        const currentStock = parseFloat(stock.current_stock) || 0;
        
        if (currentStock <= 0) {
          // CRITICAL: Product is out of stock
          recommendations.push({
            product_id: stock.product_id,
            product_name: stock.product_name,
            sku: stock.sku,
            category: stock.category,
            current_stock: currentStock,
            reorder_point: stock.reorder_point || 5,
            avg_daily_demand: 0,
            forecasted_demand: 0,
            days_of_stock: 0,
            urgency: 'critical',
            recommendation: 'OUT_OF_STOCK',
            suggested_quantity: stock.reorder_point || 10,
            estimated_cost: Math.round(((stock.reorder_point || 10) * (stock.cost_price || 0)) * 100) / 100,
            trend: 'no_sales'
          });
        } else if (currentStock <= (stock.reorder_point || 5)) {
          // MEDIUM: Below reorder point but no recent sales
          recommendations.push({
            product_id: stock.product_id,
            product_name: stock.product_name,
            sku: stock.sku,
            category: stock.category,
            current_stock: currentStock,
            reorder_point: stock.reorder_point || 5,
            avg_daily_demand: 0,
            forecasted_demand: 0,
            days_of_stock: 999,
            urgency: 'medium',
            recommendation: 'BELOW_REORDER_POINT',
            suggested_quantity: Math.max((stock.reorder_point || 10) * 2 - currentStock, 0),
            estimated_cost: Math.round((Math.max((stock.reorder_point || 10) * 2 - currentStock, 0) * (stock.cost_price || 0)) * 100) / 100,
            trend: 'no_sales'
          });
        } else {
          // INFO: Has stock but no sales in 30 days - potential dead stock
          recommendations.push({
            product_id: stock.product_id,
            product_name: stock.product_name,
            sku: stock.sku,
            category: stock.category,
            current_stock: currentStock,
            reorder_point: stock.reorder_point || 5,
            avg_daily_demand: 0,
            forecasted_demand: 0,
            days_of_stock: 999,
            urgency: 'info',
            recommendation: 'NO_RECENT_SALES',
            suggested_quantity: 0,
            estimated_cost: 0,
            trend: 'no_sales'
          });
        }
      }
    }
    
    // Sort by urgency
    const urgencyOrder = { critical: 0, high: 1, medium: 2, info: 3, normal: 4 };
    recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    
    // Summary stats
    const summary = {
      total_products_analyzed: productStats.size + stockLevels.rows.filter(s => !productStats.has(s.product_id)).length,
      critical_alerts: recommendations.filter(r => r.urgency === 'critical').length,
      high_alerts: recommendations.filter(r => r.urgency === 'high').length,
      medium_alerts: recommendations.filter(r => r.urgency === 'medium').length,
      total_estimated_cost: Math.round(recommendations.reduce((sum, r) => sum + r.estimated_cost, 0) * 100) / 100,
      generated_at: new Date().toISOString()
    };
    
    res.json({ 
      recommendations,
      summary,
      store_id: storeId
    });
  } catch (error) {
    console.error('Forecasting error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Get quick stock alerts count (for notification badge)
app.get('/api/forecasting/alerts-count', authenticate, async (req, res) => {
  try {
    const { storeId } = req.query;
    const tenantId = req.user.tenantId;
    
    // Quick check for critical stock issues
    const criticalCount = await pool.query(`
      WITH daily_demand AS (
        SELECT 
          sl.product_id,
          AVG(sl.quantity) as avg_daily
        FROM sales_lines sl
        JOIN sales_receipts sr ON sr.id = sl.receipt_id
        WHERE sl.tenant_id = $1 
          AND sr.store_id = $2
          AND sr.status = 'completed'
          AND sr.receipt_date >= NOW() - INTERVAL '14 days'
        GROUP BY sl.product_id
      )
      SELECT COUNT(*) as count
      FROM stock_on_hand soh
      LEFT JOIN daily_demand dd ON dd.product_id = soh.product_id
      WHERE soh.tenant_id = $1 
        AND soh.store_id = $2
        AND (
          soh.quantity <= 0
          OR soh.quantity < COALESCE(dd.avg_daily, 0) * 2
        )
    `, [tenantId, storeId]);
    
    res.json({ 
      critical: parseInt(criticalCount.rows[0]?.count) || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Alerts count error:', error);
    res.status(500).json({ error: 'Failed to get alerts count' });
  }
});

// Super Admin dashboard stats
app.get('/api/super-admin/stats', requireSuperAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tenants WHERE status = 'active') as active_tenants,
        (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') as suspended_tenants,
        (SELECT COUNT(*) FROM tenants) as total_tenants,
        (SELECT COUNT(*) FROM stores WHERE is_active = true) as total_stores,
        (SELECT COUNT(*) FROM users WHERE tenant_id IS NOT NULL AND is_active = true) as total_users
    `);
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Retail ERP Backend API                               ║
║   Running on http://localhost:${PORT}                       ║
║                                                           ║
║   Endpoints:                                              ║
║   • POST /api/auth/login                                  ║
║   • GET  /api/auth/me                                     ║
║   • GET  /api/products                                    ║
║   • POST /api/products                                    ║
║   • POST /api/pos/sale                                    ║
║   • GET  /api/super-admin/* (Super Admin only)            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
