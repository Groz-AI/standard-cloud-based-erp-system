import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  console.log('Connecting to database...');
  
  try {
    // Test connection
    const client = await pool.connect();
    console.log('Connected to Supabase PostgreSQL');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    
    // Execute migration
    await client.query(sql);
    
    console.log('Migration completed successfully!');
    console.log('All tables created in Supabase.');
    
    client.release();
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    if (error.position) {
      console.error('Error position:', error.position);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
