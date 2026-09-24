// validate.js — runs every calc's validation.samples against its own
// calculate() function. Used by test.html (a hidden, unlinked page) so a
// contributor can sanity-check a change to any calculation.

export function runValidation(registry) {
  const rows = [];
  registry.forEach((calc) => {
    const samples = calc.validation?.samples || [];
    if (!samples.length) {
      rows.push({ calcId: calc.id, calcTitle: calc.title, sampleName: '(none)', checks: [], noSamples: true });
      return;
    }
    samples.forEach((sample) => {
      let output;
      let error = null;
      try {
        output = calc.calculate(sample.inputs) || {};
      } catch (err) {
        error = err.message;
        output = { results: [] };
      }
      const checks = Object.entries(sample.expect || {}).map(([symbol, exp]) => {
        const r = (output.results || []).find((x) => x.symbol === symbol);
        const actual = r ? r.value : undefined;
        const pass = actual !== undefined && Math.abs(actual - exp.value) <= exp.tol;
        return { symbol, expected: exp.value, tol: exp.tol, unit: exp.unit, actual, pass };
      });
      rows.push({ calcId: calc.id, calcTitle: calc.title, sampleName: sample.name, checks, error });
    });
  });
  return rows;
}
