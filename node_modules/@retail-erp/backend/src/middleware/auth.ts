import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { config } from '../config/index.js';
import { query } from '../database/pool.js';
import { TenantContext } from '../types/index.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      ctx?: TenantContext;
    }
  }
}

interface JWTPayload {
  sub: string;
  tenantId: string;
  email: string;
  storeId?: string;
}

// Create JWT token
export async function createToken(payload: JWTPayload): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
  return token;
}

// Create refresh token
export async function createRefreshToken(payload: JWTPayload): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtRefreshExpiresIn)
    .sign(secret);
  return token;
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}

// Authentication middleware
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' }
      });
      return;
    }

    const token = authHeader.substring(7);
    const payload = await verifyToken(token);

    // Fetch user permissions
    const permissionsResult = await query<{ permissions: string[] }>(
      `SELECT COALESCE(
        (SELECT array_agg(DISTINCT perm)
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         CROSS JOIN LATERAL unnest(r.permissions::text[]) AS perm
         WHERE ur.user_id = $1
        ), ARRAY[]::text[]) as permissions`,
      [payload.sub]
    );

    const permissions = permissionsResult.rows[0]?.permissions || [];

    req.ctx = {
      tenantId: payload.tenantId,
      userId: payload.sub,
      storeId: payload.storeId,
      permissions
    };

    next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' }
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }
}

// Optional authentication (doesn't fail if no token)
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await verifyToken(token);
      
      const permissionsResult = await query<{ permissions: string[] }>(
        `SELECT COALESCE(
          (SELECT array_agg(DISTINCT perm)
           FROM user_roles ur
           JOIN roles r ON ur.role_id = r.id
           CROSS JOIN LATERAL unnest(r.permissions::text[]) AS perm
           WHERE ur.user_id = $1
          ), ARRAY[]::text[]) as permissions`,
        [payload.sub]
      );

      req.ctx = {
        tenantId: payload.tenantId,
        userId: payload.sub,
        storeId: payload.storeId,
        permissions: permissionsResult.rows[0]?.permissions || []
      };
    }
  } catch {
    // Silently ignore auth errors for optional auth
  }
  next();
}

// Permission check middleware
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.ctx) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      return;
    }

    const hasPermission = requiredPermissions.some(perm => 
      req.ctx!.permissions.includes(perm)
    );

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: { 
          code: 'FORBIDDEN', 
          message: 'Insufficient permissions',
          details: { required: requiredPermissions }
        }
      });
      return;
    }

    next();
  };
}

// Store scope middleware (ensure user has access to specified store)
export async function requireStoreAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.ctx) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
    return;
  }

  const storeId = req.params.storeId || req.body?.storeId || req.query.storeId;
  
  if (!storeId) {
    next();
    return;
  }

  // Check if user has access to this store
  const accessResult = await query(
    `SELECT 1 FROM user_stores WHERE user_id = $1 AND store_id = $2
     UNION
     SELECT 1 FROM users WHERE id = $1 AND default_store_id = $2`,
    [req.ctx.userId, storeId]
  );

  if (accessResult.rowCount === 0) {
    // Check if user is admin (has ADMIN_STORES permission)
    if (!req.ctx.permissions.includes('ADMIN_STORES')) {
      res.status(403).json({
        success: false,
        error: { code: 'STORE_ACCESS_DENIED', message: 'No access to this store' }
      });
      return;
    }
  }

  req.ctx.storeId = storeId as string;
  next();
}
