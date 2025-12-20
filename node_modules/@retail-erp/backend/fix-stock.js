require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixStock() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('1. Merging duplicate stock_on_hand records...');
    
    // Get all duplicates grouped with tenant_id
    const dupes = await client.query(`
      SELECT product_id, store_id, tenant_id, SUM(quantity) as total_qty
      FROM stock_on_hand
      GROUP BY product_id, store_id, tenant_id
    `);
    
    // Delete all existing records
    await client.query('DELETE FROM stock_on_hand');
    console.log('   Cleared old records');
    
    // Re-insert merged records
    for (const row of dupes.rows) {
      await client.query(
        'INSERT INTO stock_on_hand (product_id, store_id, tenant_id, quantity) VALUES ($1, $2, $3, $4)',
        [row.product_id, row.store_id, row.tenant_id, row.total_qty]
      );
    }
    console.log(`   Inserted ${dupes.rows.length} merged records`);
    
    // Add unique constraint if not exists
    console.log('2. Adding unique constraint...');
    try {
      await client.query(`
        ALTER TABLE stock_on_hand 
        ADD CONSTRAINT stock_on_hand_product_store_unique 
        UNIQUE (product_id, store_id)
      `);
      console.log('   Unique constraint added');
    } catch (e) {
      if (e.code === '42710') {
        console.log('   Constraint already exists');
      } else {
        throw e;
      }
    }
    
    await client.query('COMMIT');
    
    // Show fixed records
    const result = await pool.query(`
      SELECT p.name, p.sku, soh.quantity
      FROM stock_on_hand soh 
      JOIN products p ON p.id = soh.product_id 
      ORDER BY p.name
    `);
    
    console.log('\n=== Fixed Stock Records ===');
    result.rows.forEach(row => {
      console.log(`${row.name} (${row.sku}): ${row.quantity}`);
    });
    
    console.log('\n✓ Stock fixed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
}

fixStock();
