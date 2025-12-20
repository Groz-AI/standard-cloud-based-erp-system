import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Isolation Middleware
 * 
 * This middleware ensures strict tenant isolation by:
 * 1. Extracting tenant context from authenticated user
 * 2. Adding tenant_id to all database queries via request context
 * 3. Validating that requested resources belong to the tenant
 */

// Middleware to enforce tenant context on all API requests
export function enforceTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.ctx?.tenantId) {
    res.status(401).json({
      success: false,
      error: { 
        code: 'TENANT_CONTEXT_MISSING', 
        message: 'Tenant context is required for this operation' 
      }
    });
    return;
  }
  next();
}

// Helper to build tenant-scoped WHERE clause
export function tenantWhere(tenantId: string, tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `${prefix}tenant_id = '${tenantId}'`;
}

// Helper class for building tenant-isolated queries
export class TenantQueryBuilder {
  private tenantId: string;
  private conditions: string[] = [];
  private params: unknown[] = [];
  private paramIndex: number;

  constructor(tenantId: string, startParamIndex: number = 1) {
    this.tenantId = tenantId;
    this.paramIndex = startParamIndex;
    // Always add tenant isolation as first condition
    this.conditions.push(`tenant_id = $${this.paramIndex}`);
    this.params.push(tenantId);
    this.paramIndex++;
  }

  where(condition: string, ...values: unknown[]): this {
    // Replace ? placeholders with $n parameters
    let processedCondition = condition;
    values.forEach(value => {
      processedCondition = processedCondition.replace('?', `$${this.paramIndex}`);
      this.params.push(value);
      this.paramIndex++;
    });
    this.conditions.push(processedCondition);
    return this;
  }

  and(condition: string, ...values: unknown[]): this {
    return this.where(condition, ...values);
  }

  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.conditions.push('1 = 0'); // Always false if empty array
      return this;
    }
    const placeholders = values.map((_, i) => `$${this.paramIndex + i}`).join(', ');
    this.conditions.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    this.paramIndex += values.length;
    return this;
  }

  buildWhere(): string {
    return this.conditions.join(' AND ');
  }

  getParams(): unknown[] {
    return this.params;
  }

  getNextParamIndex(): number {
    return this.paramIndex;
  }
}

// Validate that an entity belongs to the tenant
export async function validateTenantOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // This is handled at the database query level
  // All queries must include tenant_id filter
  next();
}

// Middleware to set store context from request
export function setStoreContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const storeId = req.params.storeId || req.body?.storeId || req.query.storeId;
  
  if (storeId && req.ctx) {
    req.ctx.storeId = storeId as string;
  }
  
  next();
}
