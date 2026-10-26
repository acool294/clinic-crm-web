// Generates src/lib/database.types.ts from the migrations, in the shape
// `supabase gen types typescript` produces, without needing Docker or a project.
//   npm run gen:types          write the file
//   npm run gen:types -- --check  fail if the file is out of date (used in CI)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDb } from "../tests/db/harness.ts";

const out = path.resolve(import.meta.dirname, "../src/lib/database.types.ts");

interface Column {
  table_name: string;
  column_name: string;
  udt_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  has_default: boolean;
  is_generated: boolean;
  is_view: boolean;
}

const db = await createDb();

const enums = (
  await db.query<{ name: string; values: string[] }>(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as values
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by t.typname`)
).rows;
const enumNames = new Set(enums.map((e) => e.name));

function tsType(udt: string): string {
  const isArray = udt.startsWith("_");
  const base = isArray ? udt.slice(1) : udt;
  let t: string;
  if (enumNames.has(base)) t = `Database["public"]["Enums"]["${base}"]`;
  else if (["int2", "int4", "int8", "float4", "float8", "numeric", "oid"].includes(base)) t = "number";
  else if (base === "bool") t = "boolean";
  else if (base === "json" || base === "jsonb") t = "Json";
  else if (base === "void") t = "undefined";
  else t = "string";
  return isArray ? `${t}[]` : t;
}

const columns = (
  await db.query<Column>(`
    select c.table_name, c.column_name, c.udt_name, c.data_type, c.is_nullable,
           (c.column_default is not null or c.is_identity = 'YES') as has_default,
           (c.is_generated = 'ALWAYS' or c.identity_generation = 'ALWAYS') as is_generated,
           (t.table_type = 'VIEW') as is_view
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
    order by c.table_name, c.column_name`)
).rows;

const rels = (
  await db.query<{
    table_name: string;
    name: string;
    columns: string[];
    ref_table: string;
    ref_columns: string[];
    one_to_one: boolean;
  }>(`
    select cl.relname as table_name, con.conname as name,
           array(select a.attname::text from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k order by a.attname) as columns,
           rc.relname as ref_table,
           array(select a.attname::text from unnest(con.confkey) k join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k order by a.attname) as ref_columns,
           exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique
                   and (i.indkey::int2[])::int2[] @> con.conkey and array_length(i.indkey::int2[], 1) = array_length(con.conkey, 1)) as one_to_one
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rc on rc.oid = con.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    order by cl.relname, con.conname`)
).rows;

const functions = (
  await db.query<{
    name: string;
    arg_names: string[] | null;
    arg_types: string[];
    arg_modes: string[] | null;
    n_defaults: number;
    ret_type: string;
    ret_set: boolean;
    ret_relation: string | null;
  }>(`
    select p.proname as name, p.proargnames::text[] as arg_names,
           array(select t.typname::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(o, i)
                 join pg_type t on t.oid = u.o order by u.i) as arg_types,
           p.proargmodes::text[] as arg_modes, p.pronargdefaults as n_defaults,
           rt.typname as ret_type, p.proretset as ret_set,
           (select c.relname from pg_class c where c.oid = rt.typrelid) as ret_relation
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f'
    order by p.proname`)
).rows;

const byTable = new Map<string, Column[]>();
for (const c of columns) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name)!.push(c);
}

const ind = (n: number) => "  ".repeat(n);
const lines: string[] = [];
const push = (n: number, s: string) => lines.push(ind(n) + s);

function relationships(table: string, depth: number) {
  const rs = rels.filter((r) => r.table_name === table);
  if (rs.length === 0) return push(depth, "Relationships: []");
  push(depth, "Relationships: [");
  for (const r of rs) {
    push(depth + 1, "{");
    push(depth + 2, `foreignKeyName: "${r.name}"`);
    push(depth + 2, `columns: [${r.columns.map((c) => `"${c}"`).join(", ")}]`);
    push(depth + 2, `isOneToOne: ${r.one_to_one}`);
    push(depth + 2, `referencedRelation: "${r.ref_table}"`);
    push(depth + 2, `referencedColumns: [${r.ref_columns.map((c) => `"${c}"`).join(", ")}]`);
    push(depth + 1, "},");
  }
  push(depth, "]");
}

lines.push("// Generated by scripts/gen-types.ts from supabase/migrations. Do not edit by hand.");
lines.push("");
lines.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
lines.push("");
lines.push("export type Database = {");
push(1, "__InternalSupabase: {");
push(2, 'PostgrestVersion: "12";');
push(1, "};");
push(1, "public: {");

push(2, "Tables: {");
for (const [table, cols] of byTable) {
  if (cols[0].is_view) continue;
  push(3, `${table}: {`);
  push(4, "Row: {");
  for (const c of cols) push(5, `${c.column_name}: ${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""};`);
  push(4, "};");
  for (const kind of ["Insert", "Update"] as const) {
    push(4, `${kind}: {`);
    for (const c of cols) {
      const t = `${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`;
      if (c.is_generated) push(5, `${c.column_name}?: never;`);
      else if (kind === "Update" || c.has_default || c.is_nullable === "YES") push(5, `${c.column_name}?: ${t};`);
      else push(5, `${c.column_name}: ${t};`);
    }
    push(4, "};");
  }
  relationships(table, 4);
  push(3, "};");
}
push(2, "};");

push(2, "Views: {");
for (const [table, cols] of byTable) {
  if (!cols[0].is_view) continue;
  push(3, `${table}: {`);
  push(4, "Row: {");
  for (const c of cols) push(5, `${c.column_name}: ${tsType(c.udt_name)} | null;`);
  push(4, "};");
  push(4, "Relationships: [];");
  push(3, "};");
}
push(2, "};");

push(2, "Functions: {");
for (const f of functions) {
  const modes = f.arg_modes ?? f.arg_types.map(() => "i");
  const names = f.arg_names ?? [];
  const inputs: string[] = [];
  const outputs: string[] = [];
  const inputCount = modes.filter((m) => m === "i" || m === "b").length;
  let inputIndex = 0;
  modes.forEach((m, i) => {
    const name = names[i] ?? `arg${i}`;
    if (m === "i" || m === "b") {
      const optional = inputIndex >= inputCount - f.n_defaults;
      // SQL arguments can always be null; the functions decide what null means
      inputs.push(`${name}${optional ? "?" : ""}: ${tsType(f.arg_types[i])} | null`);
      inputIndex++;
    }
    if (m === "t" || m === "o" || m === "b") outputs.push(`${name}: ${tsType(f.arg_types[i])}`);
  });
  let ret: string;
  if (outputs.length > 0) ret = `{ ${outputs.join("; ")} }`;
  else if (f.ret_relation) ret = `Database["public"]["Tables"]["${f.ret_relation}"]["Row"]`;
  else ret = tsType(f.ret_type);
  if (f.ret_set) ret = `${ret}[]`;
  push(3, `${f.name}: {`);
  push(4, `Args: ${inputs.length ? `{ ${inputs.join("; ")} }` : "Record<PropertyKey, never>"};`);
  push(4, `Returns: ${ret};`);
  push(3, "};");
}
push(2, "};");

push(2, "Enums: {");
for (const e of enums) push(3, `${e.name}: ${e.values.map((v) => `"${v}"`).join(" | ")};`);
push(2, "};");
push(2, "CompositeTypes: Record<PropertyKey, never>;");
push(1, "};");
lines.push("};");
lines.push("");
lines.push('type PublicSchema = Database["public"];');
lines.push('export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];');
lines.push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];');
lines.push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];');
lines.push('export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];');
lines.push('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];');
lines.push("");

const text = lines.join("\n");
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== text) {
    console.error("src/lib/database.types.ts is out of date. Run npm run gen:types.");
    process.exit(1);
  }
  console.log("Types are up to date.");
} else {
  writeFileSync(out, text);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}
