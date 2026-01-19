import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

/**
 * Environment schema with validation
 * All configuration comes from environment variables
 */
const envSchema = z.object({
  // Server Settings
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  UDP_PORT: z.string().transform(Number).default('27010'),
  UDP_HOST: z.string().default('0.0.0.0'),

  // API Configuration
  API_URL: z.string().url(),
  API_UPDATE_INTERVAL: z.string().transform(Number).default('1200000'), // 20 minutes

  // Connection Logging
  ENABLE_CONNECTION_LOGGING: z.string().transform((v) => v === 'true').default('true'),
  CONNECTIONS_API_URL: z.string().url().optional(),
  LOG_FILE: z.string().default('connections.log'),

  // Local Server List
  LOCAL_SERVERS_FILE: z.string().default('local-servers.json'),
  LOCAL_SERVERS_PRIORITY: z.enum(['high', 'low', 'only']).default('high'),

  // Rate Limiting
  MAX_CONNECTIONS_PER_IP: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),

  // Performance Tuning
  MAX_TRACKED_CONNECTIONS: z.string().transform(Number).default('100000'),
  CONNECTION_TTL_MS: z.string().transform(Number).default('86400000'), // 24 hours
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 * Will throw on startup if required variables are missing
 */
let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('[ERROR] Environment validation failed:');
    error.errors.forEach((err) => {
      console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };
