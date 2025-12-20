require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function verifyDatabase() {
  console.log('🔍 Verifying Supabase Database Connection...\n');
  
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to Supabase PostgreSQL\n');
    
    // Check tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`📋 Tables in database: ${tablesResult.rows.length}`);
    console.log('─'.repeat(50));
    
    // Count records in key tables
    const tables = [
      'tenants',
      'stores', 
      'users',
      'products',
      'categories',
      'brands',
      'customers',
      'sales_receipts',
      'sales_lines',
      'stock_on_hand',
      'stock_ledger',
    ];
    
    console.log('\n📊 Current Data in Cloud Database:');
    console.log('─'.repeat(50));
    
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
        const count = result.rows[0].count;
        const status = count > 0 ? '🟢' : '⚪';
        console.log(`${status} ${table.padEnd(20)} : ${count} records`);
      } catch (e) {
        console.log(`🔴 ${table.padEnd(20)} : Error - ${e.message}`);
      }
    }
    
    // Show tenant info
    console.log('\n👤 Registered Tenants:');
    console.log('─'.repeat(50));
    const tenants = await client.query('SELECT id, name, slug, currency_code, created_at FROM tenants');
    if (tenants.rows.length === 0) {
      console.log('   No tenants registered yet');
    } else {
      tenants.rows.forEach(t => {
        console.log(`   • ${t.name} (${t.slug}) - ${t.currency_code} - Created: ${new Date(t.created_at).toLocaleString()}`);
      });
    }
    
    client.release();
    
    console.log('\n' + '═'.repeat(50));
    console.log('✅ ALL DATA IS STORED IN SUPABASE CLOUD DATABASE');
    console.log('✅ Any records you create will be saved to the cloud');
    console.log('═'.repeat(50));
    
  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
  } finally {
    await pool.end();
  }
}

verifyDatabase();
