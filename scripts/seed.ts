// Fills a staging project with demo staff, patients, visits and invoices.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SEED_PASSWORD=… npm run seed
// The same data can be loaded from Settings → Demo data. Never run it on real patient data.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.ts";
import { seedDemo } from "../src/modules/demo/seed.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !key || !password || password.length < 10) {
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD (10+ characters).");
  process.exit(1);
}

const result = await seedDemo(createClient<Database>(url, key, { auth: { persistSession: false } }), password);
console.log(`Seeded ${result.patients} patients and ${result.appointments} appointments.`);
for (const l of result.logins) console.log(`  ${l.email} (${l.role})`);
console.log("All use SEED_PASSWORD.");
