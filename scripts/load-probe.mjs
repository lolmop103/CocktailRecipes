// Read-path budget probe (spec 2026-10-16, "Efficiency budget" → CPU / server).
//
// Seeds a throwaway database in-process, starts the production build against
// it, and measures the rows below. Exits 1 when a gated row misses its budget.
//
// Usage: npm run build && npm run probe -- [--recipes 1000] [--gate-flood]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};

const RECIPES = option('--recipes', 1000);
const GATE_FLOOD = flag('--gate-flood');
const PORT = 3111;
const BASE = `http://localhost:${String(PORT)}/api`;
const RUNS = 20;
const FLOOD_CLIENTS = 10;
const FLOOD_MS = 3000;
const HEALTH_SAMPLE_MS = 50;

const BUDGET = { worstMs: 30, typicalMs: 5, healthP95Ms: 50 };

const INGREDIENTS = [
  'white rum',
  'dark rum',
  'gin',
  'vodka',
  'tequila',
  'mezcal',
  'bourbon',
  'rye whiskey',
  'lime juice',
  'lemon juice',
  'simple syrup',
  'honey syrup',
  'mint',
  'soda water',
  'triple sec',
  'angostura bitters',
  'orange bitters',
  'sugar',
  'ginger beer',
  'campari',
  'sweet vermouth',
  'dry vermouth',
  'orange peel',
  'egg white',
  'cranberry juice',
  'pineapple juice',
  'grapefruit juice',
  'coconut cream',
  'espresso',
  'coffee liqueur',
  'prosecco',
  'aperol',
  'maraschino',
  'chartreuse',
  'absinthe',
  'cream',
  'nutmeg',
  'cinnamon syrup',
  'grenadine',
  'tonic water',
];

const repoRoot = resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'cocktail-probe-'));
const serverEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(PORT),
  DATA_DIR: dataDir,
  LOG_LEVEL: 'error',
  CLIENT_ORIGIN: `http://localhost:${String(PORT)}`,
  // Test-only credentials (cheap hash of 'test-admin-password'): production
  // refuses to start without an admin.
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH:
    'scrypt$1024$8$1$Y29ja3RhaWwtdGVzdC1zYWx0$SrCe7cQgqgEmwhEu4/R56wDLexjTLseaW2nJIWA78e0qu6feX2AcMaLgvRY6NqW4Mi2PMw9HRvKPTN9lYuaIQA==',
};

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  Object.assign(process.env, serverEnv);
  const dist = (p) => pathToFileURL(join(repoRoot, 'server', 'dist', p)).href;
  const { recipeStore } = await import(dist('data/recipeStore.js'));
  const { db } = await import(dist('data/connection.js'));
  db.transaction(() => {
    for (let k = 0; k < RECIPES; k++) {
      const count = 4 + (k % 5);
      const ingredients = Array.from({ length: count }, (_, j) => ({
        name: INGREDIENTS[(k * 7 + j * 3) % INGREDIENTS.length],
        amount: '30ml',
      }));
      recipeStore.add({
        name: `Probe recipe ${String(k)}`,
        ingredients,
        instructions: 'Shake with ice and strain into a chilled glass.',
        glassType: 'coupe',
        tags: ['classic'],
        rating: 1 + (k % 5),
        isMocktail: k % 4 === 0,
      });
    }
  })();
  db.close();
}

async function timed(url) {
  const started = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer();
  return { ms: performance.now() - started, status: res.status };
}

async function waitForHealth() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await wait(100);
  }
  throw new Error('server did not become healthy');
}

async function medianOf(url) {
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const { ms, status } = await timed(url);
    if (status !== 200) throw new Error(`${url} answered ${String(status)}`);
    times.push(ms);
  }
  return median(times);
}

async function healthDuringFlood(url) {
  let flooding = true;
  const clients = Array.from({ length: FLOOD_CLIENTS }, async () => {
    while (flooding) await timed(url);
  });
  const samples = [];
  const end = Date.now() + FLOOD_MS;
  while (Date.now() < end) {
    samples.push((await timed(`${BASE}/health`)).ms);
    await wait(HEALTH_SAMPLE_MS);
  }
  flooding = false;
  await Promise.all(clients);
  return p95(samples);
}

const include = INGREDIENTS.slice(0, 20).join(',');
const exclude = INGREDIENTS.slice(20, 40).join(',');
const worstUrl = `${BASE}/recipes?ingredients=${include}&excludeIngredients=${exclude}&onlySelectedIngredients=true&sortBy=ingredientCount&limit=48`;
const typicalUrl = `${BASE}/recipes?ingredients=rum,lime&excludeIngredients=mint&sortBy=rating`;

await seed();
const server = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: repoRoot,
  env: serverEnv,
  stdio: 'inherit',
});

let failed = false;
const report = (label, value, budget, gated = true) => {
  const ok = value <= budget;
  if (!ok && gated) failed = true;
  const verdict = ok ? 'ok' : gated ? 'OVER BUDGET' : 'over budget (not gated)';
  console.log(
    `${label.padEnd(26)} ${value.toFixed(1).padStart(7)} ms  (budget ≤ ${String(budget)} ms) ${verdict}`,
  );
};

try {
  await waitForHealth();
  console.log(`== ${String(RECIPES)} probe recipes + seed`);
  report('worst legal filter', await medianOf(worstUrl), BUDGET.worstMs);
  report('typical filter', await medianOf(typicalUrl), BUDGET.typicalMs);
  report(
    'health p95 during flood',
    await healthDuringFlood(worstUrl),
    BUDGET.healthP95Ms,
    GATE_FLOOD,
  );
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  server.kill();
  await wait(300);
  rmSync(dataDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
