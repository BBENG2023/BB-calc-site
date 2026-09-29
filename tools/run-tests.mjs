// Command-line runner for every calc's validation samples (same harness as
// test.html). Usage: node tools/run-tests.mjs
import { registry } from '../js/registry.js';
import { runValidation } from '../js/validate.js';

const rows = runValidation(registry);
let total = 0, passed = 0, failedRows = 0;
rows.forEach((r) => {
  const ok = !r.error && !r.noSamples && r.checks.every((c) => c.pass);
  total += r.checks.length;
  passed += r.checks.filter((c) => c.pass).length;
  if (!ok) failedRows++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.calcId} — ${r.sampleName.slice(0, 90)}`);
  if (r.error) console.log(`      error: ${r.error}`);
  r.checks.filter((c) => !c.pass).forEach((c) => console.log(`      ${c.symbol}: expected ${c.expected} ± ${c.tol}, got ${c.actual}`));
});
console.log(`\n${registry.length} calcs, ${rows.length} samples — ${passed}/${total} checks passed${failedRows ? ` — ${failedRows} sample(s) failing` : ''}`);
process.exit(failedRows ? 1 : 0);
