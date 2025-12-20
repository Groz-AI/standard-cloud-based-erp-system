require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function cleanup() {
  console.log('Cleaning up test data...');
  try {
    // Delete all test tenants (this cascades to related data)
    await pool.query(`DELETE FROM tenants WHERE slug IN ('a', 'test', 'my-store')`);
    console.log('✓ Cleaned up test tenants');
    
    // Also clean any orphaned data
    await pool.query(`DELETE FROM users WHERE tenant_id NOT IN (SELECT id FROM tenants)`);
    console.log('✓ Cleaned up orphaned users');
    
    console.log('\nDatabase cleaned! Try registering again.');
  } catch (error) {
    console.error('Cleanup error:', error.message);
  } finally {
    await pool.end();
  }
}

cleanup();
