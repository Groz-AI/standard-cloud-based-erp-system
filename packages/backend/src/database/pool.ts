import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  min: config.dbPoolMin,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export interface TenantQuery {
  tenantId: string;
}

// Query helper with tenant isolation
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  
  if (config.nodeEnv === 'development') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
  }
  
  return res;
}

// Get a client for transactions
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Health check
export async function checkConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default pool;
