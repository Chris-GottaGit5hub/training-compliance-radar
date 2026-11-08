// Seeded 10k synthetic personnel set. Writes data/synthetic-10k/{roster,attendance,catalog}.csv.
// Usage: npx tsx scripts/generate-10k-data.ts   (optional: SAMPLE_YEAR=2026 to pin the year)
// Separate from the 300-row sample in public/sample, which "Load sample data" uses.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backtest, evaluateRoster, summarizeOrg } from "../lib/engine";
import { CSV_LIMITS, defaultRulesConfig, validateCsv } from "../lib/schemas";
import { build10kDataset } from "./sample-data-10k";

const year = Number(process.env.SAMPLE_YEAR) || 2026;
const outDir = path.resolve(process.cwd(), "data", "synthetic-10k");
const { files } = build10kDataset(year);

// The written files must pass the app's own validator, exactly as an upload would.
function check<K extends keyof typeof files>(kind: K) {
  const text = files[kind];
  const result = validateCsv(kind, text);
  if (!result.ok) throw new Error(`${kind}.csv failed validation: ${JSON.stringify(result.errors)}`);
  const mb = new TextEncoder().encode(text).length / 1024 / 1024;
  console.log(`${kind}.csv: ${result.rows.length} rows, ${mb.toFixed(2)} MB (limits: ${CSV_LIMITS.maxRows} rows, 5 MB)`);
  return result.rows;
}
const parsed = { roster: check("roster"), attendance: check("attendance"), catalog: check("catalog") };

mkdirSync(outDir, { recursive: true });
for (const [kind, text] of Object.entries(files)) writeFileSync(path.join(outDir, `${kind}.csv`), text);

const config = defaultRulesConfig(`${year}-09-30`);
const t0 = performance.now();
const { results } = evaluateRoster(parsed.roster, parsed.attendance, config);
const org = summarizeOrg(results, parsed.roster, config);
const engineMs = performance.now() - t0;
const bt = backtest(parsed.roster, parsed.attendance, config, `${year}-09-30`);

console.log(
  `As of ${config.asOfDate}: covered ${org.covered}, compliant ${org.compliant}, at-risk ${org.atRisk} ` +
    `(${((org.atRisk / org.covered) * 100).toFixed(1)}%), exempt ${org.exempt}, excluded ${org.excluded}, ` +
    `not covered ${org.notCovered}; ${org.unitsRanked.length} departments; engine ${engineMs.toFixed(0)} ms`,
);
console.log(`Back-test: precision ${bt.precision?.toFixed(2)}, recall ${bt.recall?.toFixed(2)}`);
console.log(`Wrote ${outDir}`);
