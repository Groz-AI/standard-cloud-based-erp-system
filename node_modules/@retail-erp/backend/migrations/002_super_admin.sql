-- Super Admin Provisioning + Tenant Store Quotas
-- Migration to add super admin support and tenant store limits

-- ============================================
-- SUPER ADMIN SUPPORT
-- ============================================

-- Add is_super_admin flag to users table (super admin has NULL tenant_id)
ALTER TABLE users 
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Add force password change flag
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- ============================================
-- TENANT LIMITS
-- ============================================

-- Add store_limit to tenants table (NULL = unlimited)
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS store_limit INTEGER DEFAULT NULL;

-- Add billing/subscription metadata
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- ============================================
-- SUPER ADMIN AUDIT LOG (separate from tenant logs)
-- ============================================

CREATE TABLE IF NOT EXISTS super_admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_created 
  ON super_admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_logs_actor 
  ON super_admin_audit_logs(actor_user_id);

-- ============================================
-- HELPER FUNCTION: Count active stores for tenant
-- ============================================

CREATE OR REPLACE FUNCTION get_tenant_active_store_count(p_tenant_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM stores 
        WHERE tenant_id = p_tenant_id AND is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INITIAL SUPER ADMIN ACCOUNT
-- Password: SuperAdmin123! (MUST be changed immediately)
-- ============================================

-- Insert super admin user (tenant_id is NULL)
-- Default password: SuperAdmin123! (MUST be changed immediately after first login)
INSERT INTO users (
    id,
    tenant_id,
    email,
    password_hash,
    first_name,
    last_name,
    is_active,
    must_change_password
) VALUES (
    uuid_generate_v4(),
    NULL,
    'superadmin@system.local',
    '$2a$12$zQewUrsasdCQwXt3ts0p3Of5jT.Q5Wix2tWTl6feaxABCbmhZ/fVW',
    'Super',
    'Admin',
    true,
    true
) ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN users.tenant_id IS 'NULL for super admin users';
COMMENT ON COLUMN users.must_change_password IS 'Force password change on next login';
COMMENT ON COLUMN tenants.store_limit IS 'Maximum number of active stores allowed. NULL = unlimited';
COMMENT ON TABLE super_admin_audit_logs IS 'Audit trail for super admin actions (tenant management, etc.)';
