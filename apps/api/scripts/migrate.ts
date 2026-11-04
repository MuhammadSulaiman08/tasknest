/**
 * Minimal SQL migration runner.
 * Applies every migrations/NNN_name.sql file not yet recorded in schema_migrations,
 * each inside its own transaction, in filename order.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(databaseUrl: string, log = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    if (!applied.length) log('database is up to date');
    return applied;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  migrate(url).catch((e) => {
    // Connection failures to "localhost" arrive as an AggregateError with an empty message, so print the details
    const details = e instanceof AggregateError ? e.errors.map((x: Error & { code?: string }) => x.code ?? x.message).join(', ') : '';
    console.error(`Migration failed: ${e.message || e.code || ''} ${details}`.trim());
    if (/ECONNREFUSED/.test(String(e.code ?? details))) {
      console.error('Could not reach PostgreSQL. Check DATABASE_URL in apps/api/.env (for Neon it must be the postgresql://...neon.tech/... string).');
    }
    process.exit(1);
  });
}
