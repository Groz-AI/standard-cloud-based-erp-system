const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to Supabase...');
  
  try {
    const client = await pool.connect();
    console.log('Connected to Supabase PostgreSQL');

    const migrationPath = path.join(__dirname, 'migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration (this may take a minute)...');
    
    await client.query(sql);
    
    console.log('\n✓ Migration completed successfully!');
    console.log('✓ All 40+ tables created in Supabase.');
    
    client.release();
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
