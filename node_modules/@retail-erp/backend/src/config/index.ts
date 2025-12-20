import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  databaseUrl: z.string(),
  dbHost: z.string().default('localhost'),
  dbPort: z.coerce.number().default(5432),
  dbName: z.string().default('retail_erp'),
  dbUser: z.string().default('postgres'),
  dbPassword: z.string(),
  dbSsl: z.coerce.boolean().default(false),
  dbPoolMin: z.coerce.number().default(2),
  dbPoolMax: z.coerce.number().default(10),
  
  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),
  
  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('24h'),
  jwtRefreshExpiresIn: z.string().default('7d'),
  
  // BigQuery
  gcpProjectId: z.string().optional(),
  bigqueryDataset: z.string().default('retail_erp_analytics'),
  bigquerySyncIntervalMs: z.coerce.number().default(60000),
  
  // Security
  bcryptRounds: z.coerce.number().default(12),
  rateLimitWindowMs: z.coerce.number().default(900000),
  rateLimitMax: z.coerce.number().default(100),
  
  // Sync
  syncBatchSize: z.coerce.number().default(100),
});

const parseConfig = () => {
  const result = configSchema.safeParse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbName: process.env.DB_NAME,
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    dbSsl: process.env.DB_SSL,
    dbPoolMin: process.env.DB_POOL_MIN,
    dbPoolMax: process.env.DB_POOL_MAX,
    redisUrl: process.env.REDIS_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    gcpProjectId: process.env.GOOGLE_CLOUD_PROJECT,
    bigqueryDataset: process.env.BIGQUERY_DATASET,
    bigquerySyncIntervalMs: process.env.BIGQUERY_SYNC_INTERVAL_MS,
    bcryptRounds: process.env.BCRYPT_ROUNDS,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    syncBatchSize: process.env.SYNC_BATCH_SIZE,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    throw new Error('Configuration validation failed');
  }

  return result.data;
};

export const config = parseConfig();

export type Config = typeof config;
