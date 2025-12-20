const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Check categories table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'categories'
      ORDER BY ordinal_position
    `);
    console.log('Categories table columns:');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Test insert
    console.log('\nTrying test insert...');
    const testResult = await pool.query(
      `INSERT INTO categories (tenant_id, name, created_by) VALUES ($1, $2, $3) RETURNING *`,
      ['test-tenant-id', 'Test Category', 'test-user']
    );
    console.log('Insert successful:', testResult.rows[0]);
    
    // Cleanup
    await pool.query('DELETE FROM categories WHERE name = $1', ['Test Category']);
    console.log('Cleanup done');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Detail:', error.detail || 'none');
  } finally {
    await pool.end();
  }
}

check();
