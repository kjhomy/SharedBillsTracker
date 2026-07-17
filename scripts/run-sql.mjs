// One-off helper: run a .sql file against the linked Supabase project via
// the Management API, using SUPABASE_ACCESS_TOKEN from .env.local.
// Usage: node scripts/run-sql.mjs <path-to-sql-file>
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'jemdltzsrqaqhixeqitc';

const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const tokenLine = envLocal.split('\n').find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='));
const token = tokenLine?.split('=')[1]?.trim();

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN not found in .env.local');
  process.exit(1);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/run-sql.mjs <path-to-sql-file>');
  process.exit(1);
}

const query = readFileSync(sqlPath, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const body = await res.json();

if (!res.ok) {
  console.error(`Request failed (${res.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`SQL ran successfully against ${sqlPath}`);
console.log(JSON.stringify(body, null, 2));
