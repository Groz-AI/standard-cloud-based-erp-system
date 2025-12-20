require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'stock_ledger' ORDER BY ordinal_position`)
  .then(r => {
    console.log('stock_ledger columns:');
    r.rows.forEach(row => console.log('  -', row.column_name));
    pool.end();
  })
  .catch(e => { console.error(e); pool.end(); });
