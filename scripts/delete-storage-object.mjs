// One-off helper: delete an object from a Supabase Storage bucket via the
// Storage REST API, using SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Usage: node scripts/delete-storage-object.mjs <bucket> <object-path>
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://jemdltzsrqaqhixeqitc.supabase.co';

const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const keyLine = envLocal.split('\n').find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
const serviceRoleKey = keyLine?.split('=')[1]?.trim();

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const [bucket, ...pathParts] = process.argv.slice(2);
const path = pathParts.join(' ');
if (!bucket || !path) {
  console.error('Usage: node scripts/delete-storage-object.mjs <bucket> <object-path>');
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
  method: 'DELETE',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  },
});

const body = await res.json();

if (!res.ok) {
  console.error(`Request failed (${res.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`Deleted ${bucket}/${path}`);
console.log(JSON.stringify(body, null, 2));
