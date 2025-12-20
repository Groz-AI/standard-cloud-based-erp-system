/**
 * Super Admin Migration Script
 * 
 * This script runs the 002_super_admin.sql migration to:
 * 1. Add super admin support to users table (allow NULL tenant_id)
 * 2. Add store_limit to tenants table
 * 3. Create super_admin_audit_logs table
 * 4. Create initial super admin account
 * 
 * Usage: node scripts/run-super-admin-migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Running Super Admin migration...\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/002_super_admin.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements (handle $$ blocks)
    await client.query('BEGIN');
    
    // Run the migration
    await client.query(migrationSQL);
    
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!\n');
    
    // Check if super admin was created
    const result = await client.query(
      "SELECT email FROM users WHERE tenant_id IS NULL AND email = 'superadmin@system.local'"
    );
    
    if (result.rows.length > 0) {
      console.log('👤 Super Admin account created:');
      console.log('   Email: superadmin@system.local');
      console.log('   Password: SuperAdmin123!');
      console.log('   ⚠️  IMPORTANT: Change this password immediately after first login!\n');
    }
    
    // Show tenant store limits
    const tenants = await client.query('SELECT name, store_limit FROM tenants');
    if (tenants.rows.length > 0) {
      console.log('📊 Current tenant store limits:');
      tenants.rows.forEach(t => {
        console.log(`   ${t.name}: ${t.store_limit ?? 'Unlimited'}`);
      });
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
