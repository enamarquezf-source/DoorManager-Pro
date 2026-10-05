import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Isolate the WASM parser per file: its shared heap is unreliable after many large parses.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
const childSource = `
import pgQuery from 'pg-query-emscripten';
let input = ''; for await (const chunk of process.stdin) input += chunk;
try {
  const parser = await pgQuery();
  const result = parser.parse(input);
  if (result.error) { console.error(JSON.stringify(result.error)); process.exitCode = /invalid pointer|memory/i.test(result.error.message) ? 2 : 1; }
} catch (error) { console.error(String(error?.message ?? error)); process.exitCode = 2; }
`;
const failures = [];
const unverified = [];
let cursor = 0;
async function worker() {
  while (cursor < files.length) {
    const name = files[cursor++];
    await new Promise(resolve => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', childSource], { cwd: root, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      let error = '';
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', failure => { failures.push({ file: name, error: failure.message }); resolve(); });
      child.on('close', code => { if (code) (code === 1 ? failures : unverified).push({ file: name, exitCode: code, error: error.slice(0, 700) }); resolve(); });
      child.stdin.end(readFileSync(path.join(root, 'supabase/migrations', name)));
    });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(JSON.stringify({ checked: files.length, passed: files.length - failures.length - unverified.length, failures, unverified }, null, 2));
process.exitCode = failures.length ? 1 : unverified.length ? 2 : 0;
