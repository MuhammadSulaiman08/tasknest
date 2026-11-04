import pg from 'pg';
import { migrate } from '../scripts/migrate.js';

/** Rebuilds the test database schema from the migrations once per test run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/tasknest_test';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query('DROP TYPE IF EXISTS workspace_role, project_status, task_status, task_priority CASCADE');
  await client.end();
  await migrate(url, () => {});
}
