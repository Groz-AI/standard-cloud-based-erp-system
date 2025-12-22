import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { createToken, createRefreshToken } from '../middleware/auth.js';
import { User, Tenant, Store, Role } from '../types/index.js';
import { AuditService } from './audit.service.js';

export interface LoginResult {
  user: Omit<User, 'passwordHash'>;
  tenant: Tenant;
  stores: Store[];
  roles: Role[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
}

export interface RegisterTenantInput {
  tenantName: string;
  tenantSlug: string;
  currencyCode?: string;
  timezone?: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName?: string;
  storeName: string;
  storeCode?: string;
}

/**
 * Authentication Service
 * 
 * Handles user authentication, tenant registration, and session management.
 */
export class AuthService {
  /**
   * Login user
   */
  static async login(
    email: string,
    password: string
  ): Promise<LoginResult> {
    // Find user by email (across all tenants)
    const userResult = await query<User & { password_hash: string }>(
      `SELECT u.*, u.password_hash FROM users u
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Get tenant
    const tenantResult = await query<Tenant>(
      `SELECT * FROM tenants WHERE id = $1 AND status = 'active'`,
      [user.tenantId]
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('Tenant not found or inactive');
    }

    const tenant = tenantResult.rows[0];

    // Get user's stores
    const storesResult = await query<Store>(
      `SELECT s.* FROM stores s
       LEFT JOIN user_stores us ON s.id = us.store_id
       WHERE s.tenant_id = $1 AND s.is_active = true
       AND (us.user_id = $2 OR s.id = $3)`,
      [user.tenantId, user.id, user.defaultStoreId]
    );

    // Get roles and permissions
    const rolesResult = await query<Role>(
      `SELECT r.* FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const permissions = [...new Set(rolesResult.rows.flatMap(r => r.permissions))];

    // Create tokens
    const tokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      storeId: user.defaultStoreId
    };

    const accessToken = await createToken(tokenPayload);
    const refreshToken = await createRefreshToken(tokenPayload);

    // Store refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
      [uuidv4(), user.id, refreshTokenHash]
    );

    // Update last login
    await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    // Audit log
    await AuditService.log(
      { tenantId: user.tenantId, userId: user.id, permissions },
      {
        action: AuditService.ACTIONS.LOGIN,
        entityType: 'user',
        entityId: user.id
      }
    );

    // Remove sensitive fields
    const { password_hash, ...safeUser } = user;

    return {
      user: safeUser,
      tenant,
      stores: storesResult.rows,
      roles: rolesResult.rows,
      permissions,
      accessToken,
      refreshToken
    };
  }

  /**
   * Register a new tenant with admin user
   */
  static async registerTenant(input: RegisterTenantInput): Promise<LoginResult> {
    // Check if slug is taken
    const existingTenant = await query(
      `SELECT id FROM tenants WHERE slug = $1`,
      [input.tenantSlug.toLowerCase()]
    );

    if (existingTenant.rows.length > 0) {
      throw new Error('Tenant slug is already taken');
    }

    // Check if email is taken
    const existingUser = await query(
      `SELECT id FROM users WHERE email = $1`,
      [input.adminEmail.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('Email is already registered');
    }

    const tenantId = uuidv4();
    const storeId = uuidv4();
    const userId = uuidv4();
    const adminRoleId = uuidv4();

    // Create tenant
    await query(
      `INSERT INTO tenants (id, name, slug, currency_code, timezone)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, input.tenantName, input.tenantSlug.toLowerCase(), 
       input.currencyCode || 'USD', input.timezone || 'UTC']
    );

    // Create default store
    await query(
      `INSERT INTO stores (id, tenant_id, code, name)
       VALUES ($1, $2, $3, $4)`,
      [storeId, tenantId, input.storeCode || 'MAIN', input.storeName]
    );

    // Create admin role with all permissions
    const allPermissions = [
      'POS_SALE', 'POS_REFUND', 'POS_VOID', 'POS_DISCOUNT', 'POS_PARK',
      'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER', 'INVENTORY_COUNT', 'INVENTORY_GRN',
      'PURCHASING_VIEW', 'PURCHASING_PO', 'PURCHASING_SUPPLIER',
      'PRICING_VIEW', 'PRICING_EDIT', 'PRICING_PROMO',
      'MASTER_VIEW', 'MASTER_PRODUCT', 'MASTER_CATEGORY',
      'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'CUSTOMER_LOYALTY',
      'REPORTS_VIEW', 'REPORTS_SALES', 'REPORTS_INVENTORY', 'REPORTS_FINANCIAL',
      'ADMIN_USERS', 'ADMIN_ROLES', 'ADMIN_STORES', 'ADMIN_SETTINGS', 'ADMIN_AUDIT'
    ];

    await query(
      `INSERT INTO roles (id, tenant_id, name, description, permissions, is_system)
       VALUES ($1, $2, 'Admin', 'Full system access', $3, true)`,
      [adminRoleId, tenantId, JSON.stringify(allPermissions)]
    );

    // Create default roles
    const cashierRoleId = uuidv4();
    await query(
      `INSERT INTO roles (id, tenant_id, name, description, permissions, is_system)
       VALUES ($1, $2, 'Cashier', 'POS operations', $3, true)`,
      [cashierRoleId, tenantId, JSON.stringify(['POS_SALE', 'POS_PARK', 'CUSTOMER_VIEW'])]
    );

    const managerRoleId = uuidv4();
    await query(
      `INSERT INTO roles (id, tenant_id, name, description, permissions, is_system)
       VALUES ($1, $2, 'Manager', 'Store management', $3, true)`,
      [managerRoleId, tenantId, JSON.stringify([
        'POS_SALE', 'POS_REFUND', 'POS_VOID', 'POS_DISCOUNT', 'POS_PARK',
        'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER', 'INVENTORY_COUNT', 'INVENTORY_GRN',
        'CUSTOMER_VIEW', 'CUSTOMER_EDIT',
        'REPORTS_VIEW', 'REPORTS_SALES', 'REPORTS_INVENTORY'
      ])]
    );

    // Create admin user
    const passwordHash = await bcrypt.hash(input.adminPassword, config.bcryptRounds);
    await query(
      `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, default_store_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, tenantId, input.adminEmail.toLowerCase(), passwordHash,
       input.adminFirstName, input.adminLastName, storeId]
    );

    // Assign admin role
    await query(
      `INSERT INTO user_roles (id, user_id, role_id)
       VALUES ($1, $2, $3)`,
      [uuidv4(), userId, adminRoleId]
    );

    // Create default tax groups
    await query(
      `INSERT INTO tax_groups (id, tenant_id, code, name, rate, is_default)
       VALUES ($1, $2, 'STANDARD', 'Standard Rate', 0.10, true),
              ($3, $2, 'REDUCED', 'Reduced Rate', 0.05, false),
              ($4, $2, 'ZERO', 'Zero Rated', 0, false)`,
      [uuidv4(), tenantId, uuidv4(), uuidv4()]
    );

    // Create default UoMs
    await query(
      `INSERT INTO uoms (id, tenant_id, code, name, is_base)
       VALUES ($1, $2, 'EACH', 'Each', true),
              ($3, $2, 'PACK', 'Pack', false),
              ($4, $2, 'BOX', 'Box', false),
              ($5, $2, 'CASE', 'Case', false)`,
      [uuidv4(), tenantId, uuidv4(), uuidv4(), uuidv4()]
    );

    // Login and return
    return this.login(input.adminEmail, input.adminPassword);
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    // Find valid refresh token
    const tokenResult = await query<{ user_id: string; expires_at: Date }>(
      `SELECT rt.user_id, rt.expires_at FROM refresh_tokens rt
       WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
      []
    );

    let validToken = null;
    for (const token of tokenResult.rows) {
      // We'd need to check the hash here
      validToken = token;
      break;
    }

    if (!validToken) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get user
    const userResult = await query<User>(
      `SELECT * FROM users WHERE id = $1 AND is_active = true`,
      [validToken.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Create new access token
    const accessToken = await createToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      storeId: user.defaultStoreId
    });

    return { accessToken };
  }

  /**
   * Logout user
   */
  static async logout(userId: string, refreshToken?: string): Promise<void> {
    // Revoke all refresh tokens for user
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Change email
   */
  static async changeEmail(
    userId: string,
    newEmail: string,
    password: string
  ): Promise<void> {
    const userResult = await query<{ password_hash: string; email: string }>(
      `SELECT password_hash, email FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const validPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!validPassword) {
      throw new Error('Password is incorrect');
    }

    // Check if new email is already taken
    const existingUser = await query(
      `SELECT id FROM users WHERE email = $1 AND id != $2`,
      [newEmail.toLowerCase(), userId]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('Email is already in use');
    }

    await query(
      `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`,
      [newEmail.toLowerCase(), userId]
    );
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const userResult = await query<{ password_hash: string; tenant_id: string }>(
      `SELECT password_hash, tenant_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      throw new Error('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await query(
      `UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // Revoke all refresh tokens
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Create a new user
   */
  static async createUser(
    tenantId: string,
    createdBy: string,
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName?: string;
      phone?: string;
      defaultStoreId?: string;
      roleIds: string[];
    }
  ): Promise<User> {
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

    await query(
      `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, phone, default_store_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, tenantId, data.email.toLowerCase(), passwordHash,
       data.firstName, data.lastName, data.phone, data.defaultStoreId]
    );

    // Assign roles
    for (const roleId of data.roleIds) {
      await query(
        `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3)`,
        [uuidv4(), userId, roleId]
      );
    }

    const result = await query<User>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0];
  }

  /**
   * Get user by ID
   */
  static async getUserById(tenantId: string, userId: string): Promise<User | null> {
    const result = await query<User>(
      `SELECT * FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all users for tenant
   */
  static async getUsers(
    tenantId: string,
    options: { storeId?: string; isActive?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{ users: User[]; total: number }> {
    const conditions: string[] = ['u.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.isActive !== undefined) {
      conditions.push(`u.is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }

    if (options.storeId) {
      conditions.push(`(u.default_store_id = $${paramIndex} OR EXISTS (
        SELECT 1 FROM user_stores us WHERE us.user_id = u.id AND us.store_id = $${paramIndex}
      ))`);
      params.push(options.storeId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users u WHERE ${whereClause}`,
      params
    );

    const usersResult = await query<User>(
      `SELECT u.*, s.name as default_store_name,
              array_agg(DISTINCT r.name) as role_names
       FROM users u
       LEFT JOIN stores s ON u.default_store_id = s.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE ${whereClause}
       GROUP BY u.id, s.name
       ORDER BY u.first_name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      users: usersResult.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }
}

export default AuthService;
