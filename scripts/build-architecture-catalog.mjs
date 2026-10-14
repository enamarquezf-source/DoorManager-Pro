import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/architecture-map');
fs.mkdirSync(out, { recursive: true });
const names = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
const childSource = `
import pgQuery from 'pg-query-emscripten';
let sql=''; for await (const c of process.stdin) sql+=c;
// Function bodies are opaque to the SQL parser. Omit their text to avoid WASM
// heap failures on large routines; schema DDL inside DO remains explicitly unverified.
sql=sql.replace(/(\\$[a-zA-Z_0-9]*\\$)[\\s\\S]*?\\1/g, '$$$$ $$$$');
const p=await pgQuery();const r=p.parse(sql);
if(r.error){console.log(JSON.stringify({error:r.error}));process.exit(0)}
const keep=['CreateStmt','AlterTableStmt','DropStmt','RenameStmt','ViewStmt','CreateTrigStmt','CreateFunctionStmt','CreatePolicyStmt','AlterPolicyStmt'];
console.log(JSON.stringify({stmts:r.parse_tree.stmts.map(s=>s.stmt).filter(s=>keep.some(k=>s[k]))}));`;
const parsed = new Map(); let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < names.length) {
    const name = names[cursor++];
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', childSource], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', e => resolve({ error: e.message }));
      child.on('close', code => { try { resolve(JSON.parse(stdout)); } catch { resolve({ error: (stderr || `exit ${code}`).slice(-900) }); } });
      child.stdin.end(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
    });
    parsed.set(name, result);
  }
}));
const objects = new Map(), functions = new Map(), triggers = new Map();
const warnings = [], foreignKeys = new Map(), viewDependencies = [];
const strings = a => (a ?? []).map(x => x.String?.sval).filter(Boolean);
const key = r => `${r.schemaname || 'public'}.${r.relname}`;
function table(r, file) {
  const id = key(r);
  if (!objects.has(id)) objects.set(id, { schema: r.schemaname || 'public', name: r.relname, kind: 'table', columns: [], sources: [], inferred_from_alter: true });
  const t = objects.get(id); if (!t.sources.includes(file)) t.sources.push(file); return t;
}
function constraint(c, t, file, column) {
  if (c.contype === 'CONSTR_PRIMARY') for (const a of t.columns) if (a.name === column || strings(c.keys).includes(a.name)) a.primary_key = true;
  if (c.contype !== 'CONSTR_FOREIGN' || !c.pktable) return;
  const cols = column ? [column] : strings(c.fk_attrs);
  const edge = { name: c.conname || `${t.name}_${cols.join('_')}_fkey`, from_schema: t.schema, from_table: t.name, from_columns: cols, to_schema: c.pktable.schemaname || 'public', to_table: c.pktable.relname, to_columns: strings(c.pk_attrs), source: file };
  foreignKeys.set(`${t.schema}.${t.name}:${edge.name}`, edge);
}
function column(c, t, file) {
  const old = t.columns.find(x => x.name === c.colname);
  const row = { name: c.colname, type: strings(c.typeName?.names).join('.'), nullable: !(c.constraints ?? []).some(x => ['CONSTR_NOTNULL','CONSTR_PRIMARY'].includes(x.Constraint?.contype)), primary_key: false, source: file };
  if (!old) t.columns.push(row);
  for (const cc of c.constraints ?? []) constraint(cc.Constraint, t, file, c.colname);
}
function ranges(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (node.RangeVar) result.push(key(node.RangeVar));
  for (const v of Object.values(node)) if (v && typeof v === 'object') ranges(v, result);
  return [...new Set(result)];
}
for (const file of names) {
  const result = parsed.get(file);
  if (result.error) { warnings.push({ file, type: 'parse_error', detail: result.error }); continue; }
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
  if (/\bdo\s+\$|\bexecute\s+(?:format\s*\(|['"])/i.test(sql)) warnings.push({ file, type: 'conditional_or_dynamic_sql', detail: 'DDL dinámico o condicional requiere contrastar pg_catalog; no se simula su ejecución.' });
  for (const stmt of result.stmts) {
    if (stmt.CreateStmt) { const c = stmt.CreateStmt; if (c.relation.relpersistence === 't') continue; const t = table(c.relation, file); t.inferred_from_alter = false; for (const e of c.tableElts ?? []) if (e.ColumnDef) column(e.ColumnDef, t, file); else if (e.Constraint) constraint(e.Constraint, t, file); }
    if (stmt.AlterTableStmt) {
      const s = stmt.AlterTableStmt; if (s.objtype !== 'OBJECT_TABLE') continue; const t = table(s.relation, file);
      for (const entry of s.cmds ?? []) { const c = entry.AlterTableCmd;
        if (c.def?.ColumnDef && ['AT_AddColumn','AT_AddColumnToView'].includes(c.subtype)) column(c.def.ColumnDef, t, file);
        if (c.subtype === 'AT_AddConstraint' && c.def?.Constraint) constraint(c.def.Constraint, t, file);
        if (c.subtype === 'AT_DropConstraint') foreignKeys.delete(`${key(s.relation)}:${c.name}`);
        if (c.subtype === 'AT_DropColumn') { t.columns = t.columns.filter(x => x.name !== c.name); for (const [id, e] of foreignKeys) if (`${e.from_schema}.${e.from_table}` === key(s.relation) && e.from_columns.includes(c.name)) foreignKeys.delete(id); }
        if (c.subtype === 'AT_EnableRowSecurity') t.rls_enabled = true;
        if (c.subtype === 'AT_DisableRowSecurity') t.rls_enabled = false;
      }
    }
    if (stmt.DropStmt && ['OBJECT_TABLE','OBJECT_VIEW','OBJECT_MATVIEW'].includes(stmt.DropStmt.removeType)) for (const o of stmt.DropStmt.objects ?? []) { const a = strings(o.List?.items); const id = a.length > 1 ? a.join('.') : `public.${a[0]}`; objects.delete(id); for (const [k,e] of foreignKeys) if (`${e.from_schema}.${e.from_table}` === id || `${e.to_schema}.${e.to_table}` === id) foreignKeys.delete(k); }
    if (stmt.ViewStmt) { const v = stmt.ViewStmt; objects.set(key(v.view), { schema: v.view.schemaname || 'public', name: v.view.relname, kind: 'view', columns: [], sources: [file] }); const refs = ranges(v.query); for (const r of refs) if(r!==key(v.view)) viewDependencies.push({view:key(v.view),table:r,source:file}); }
    if (stmt.CreateFunctionStmt) { const f = stmt.CreateFunctionStmt; const n = strings(f.funcname).join('.'); const body = f.options?.find(x=>x.DefElem?.defname==='as')?.DefElem?.arg?.List?.items?.map(x=>x.String?.sval||'').join('\n') || ''; functions.set(n, {name:n,source:file,body}); }
    if (stmt.CreateTrigStmt) { const t=stmt.CreateTrigStmt; triggers.set(`${key(t.relation)}:${t.trigname}`,{schema:t.relation.schemaname||'public',table:t.relation.relname,name:t.trigname,function:strings(t.funcname).join('.'),source:file}); }
  }
}
const serviceUsage = [];
function walkDir(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walkDir(path.join(dir,e.name)):[path.join(dir,e.name)]); }
for (const file of walkDir(path.join(root,'src')).filter(f=>/\.(ts|tsx)$/.test(f)&&!f.includes('.test.'))) {
  const sql=fs.readFileSync(file,'utf8');
  const tables=[...new Set([...sql.matchAll(/\.from\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]))];
  const rpcs=[...new Set([...sql.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]))];
  if(tables.length||rpcs.length) serviceUsage.push({file:path.relative(root,file).replaceAll('\\','/'),tables,rpcs});
}
const catalog={source:'repository_migrations_NOT_LIVE',captured_at:'2026-10-14',migration_count:names.length,latest_migration:names.at(-1),scope_note:'Reconstrucción de DDL estático. No certifica migraciones aplicadas ni DDL dentro de DO/SQL dinámico. Espera exportación de pg_catalog para confirmar producción.',tables_and_views:[...objects.values()].sort((a,b)=>`${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)),foreign_keys:[...foreignKeys.values()],view_dependencies:viewDependencies.filter(v=>objects.has(v.table)),triggers:[...triggers.values()],public_functions:[...functions.values()].map(f=>({name:f.name,source:f.source})),service_usage:serviceUsage,warnings};
const liveIndex=process.argv.indexOf('--live');
if(liveIndex>=0){const live=JSON.parse(fs.readFileSync(process.argv[liveIndex+1],'utf8'));if(live.source!=='live_pg_catalog')throw Error('La exportación no identifica live_pg_catalog');Object.assign(catalog,live,{scope_note:'Catálogo real exportado mediante consulta de solo lectura; asociaciones de servicios extraídas del repositorio.'});}
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2));
console.log(JSON.stringify({source:catalog.source,tables:catalog.tables_and_views.filter(t=>t.kind==='table').length,views:catalog.tables_and_views.filter(t=>t.kind!=='table').length,foreign_keys:catalog.foreign_keys.length,functions:catalog.public_functions.length,triggers:catalog.triggers.length,services:serviceUsage.length,parse_errors:warnings.filter(w=>w.type==='parse_error'),conditional_files:warnings.filter(w=>w.type==='conditional_or_dynamic_sql').length},null,2));
