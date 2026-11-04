import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  COOKIE_DOMAIN: z.string().optional().transform((v) => v || undefined),
  // Optional integrations: each feature switches on when its variables are set
  GOOGLE_CLIENT_ID: z.string().optional().transform((v) => v || undefined),
  GOOGLE_CLIENT_SECRET: z.string().optional().transform((v) => v || undefined),
  RESEND_API_KEY: z.string().optional().transform((v) => v || undefined),
  EMAIL_FROM: z.string().default('TaskNest <onboarding@resend.dev>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
export const googleEnabled = !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
