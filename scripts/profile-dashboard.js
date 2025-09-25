const fs = require('fs');
const path = require('path');
const Module = require('module');

const projectRoot = path.resolve(__dirname, '..');
const buildOutputDir = path.join(projectRoot, 'tmp', 'ts-build');
const aliasPrefix = '@/';
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request.startsWith(aliasPrefix)) {
    const relative = request.slice(aliasPrefix.length);
    const normalized = relative.startsWith('lib/') ? relative.slice(4) : relative;
    const resolved = path.join(buildOutputDir, normalized);
    return originalResolveFilename.call(this, resolved, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const envPath = path.join(projectRoot, '.env.local');
if (fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, 'utf8');
  envContents.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

const { supabaseAdmin } = require('../tmp/ts-build/supabase/admin');
const { fetchDashboardData } = require('../tmp/ts-build/invoices/dashboard');

async function runScenario(label, filters) {
  console.log(`\n=== Scenario: ${label} ===`);
  try {
    const admin = supabaseAdmin();
    const data = await fetchDashboardData(admin, filters);
    console.log('Result snapshot', {
      totalCurrent: data.totalInvoicesCurrent,
      totalPrevious: data.totalInvoicesPrevious,
      statusBreakdown: data.statusBreakdown,
    });
  } catch (error) {
    console.error('Scenario failed', { label, error });
  }
}

async function main() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const startLarge = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const endLarge = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  const startSmall = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 9));

  const toIso = (date) => date.toISOString().slice(0, 10);

  await runScenario('last_12_months', {
    from: toIso(startLarge),
    to: toIso(endLarge),
  });

  await runScenario('last_10_days', {
    from: toIso(startSmall),
    to: toIso(end),
  });
}

main().then(() => {
  console.log('\nDone profiling fetchDashboardData');
  process.exit(0);
});
