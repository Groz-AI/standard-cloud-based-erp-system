require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkStock() {
  try {
    // Check stock_on_hand for duplicates
    const result = await pool.query(`
      SELECT soh.product_id, p.name, p.sku, soh.store_id, soh.quantity, COUNT(*) OVER (PARTITION BY soh.product_id, soh.store_id) as record_count
      FROM stock_on_hand soh 
      JOIN products p ON p.id = soh.product_id 
      ORDER BY p.name, soh.store_id
    `);
    
    console.log('\n=== Stock On Hand Records ===\n');
    result.rows.forEach(row => {
      const duplicate = row.record_count > 1 ? ' [DUPLICATE!]' : '';
      console.log(`${row.name} (${row.sku}) | Store: ${row.store_id.slice(0,8)}... | Qty: ${row.quantity}${duplicate}`);
    });
    
    // Check for duplicates
    const dupes = await pool.query(`
      SELECT product_id, store_id, COUNT(*) as cnt 
      FROM stock_on_hand 
      GROUP BY product_id, store_id 
      HAVING COUNT(*) > 1
    `);
    
    if (dupes.rows.length > 0) {
      console.log('\n⚠️  Found duplicate product/store combinations!');
    } else {
      console.log('\n✓ No duplicates found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    pool.end();
  }
}

checkStock();
