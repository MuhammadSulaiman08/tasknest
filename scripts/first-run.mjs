#!/usr/bin/env node
/**
 * One-command local setup (works in PowerShell, cmd, macOS and Linux):
 *   1. creates apps/api/.env and apps/web/.env.local from the examples (if missing)
 *   2. starts PostgreSQL in Docker and waits until it is ready
 *   3. runs the database migrations
 *   4. loads the demo workspace (login: demo@tasknest.app / password123)
 * Skip Docker (e.g. you installed PostgreSQL yourself):  pnpm first-run --no-docker
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

for (const [from, to] of [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
]) {
  if (existsSync(to)) console.log(`✓ ${to} already exists (kept)`);
  else {
    copyFileSync(from, to);
    console.log(`✓ created ${to}`);
  }
}

if (!process.argv.includes('--no-docker')) {
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    console.error('\n✗ Docker is not running. Start Docker Desktop and run this again,');
    console.error('  or install PostgreSQL yourself, update DATABASE_URL in apps/api/.env and run: pnpm first-run --no-docker');
    process.exit(1);
  }
  run('docker compose up -d --wait db');
}
run('pnpm --filter @tasknest/api migrate');
run('pnpm --filter @tasknest/api db:seed');

console.log('\n✓ All set. Start the app with:  pnpm dev');
console.log('  then open http://localhost:3000 and log in as demo@tasknest.app / password123\n');
