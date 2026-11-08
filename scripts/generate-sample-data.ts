// Seeded synthetic data generator (spec §7). Writes public/sample/{roster,attendance,catalog,calendar}.csv:
// 12,000 fictional employees in 50 departments under 7 sectors, with attendance, a course catalog
// and a training calendar. "Load sample data" in the app loads these files.
// Usage: npm run sample-data   (optional: SAMPLE_YEAR=2026 to pin the year)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backtest, evaluateRoster, summarizeOrg, todayManila } from "../lib/engine";
import { CSV_LIMITS, defaultRulesConfig, validateCsv } from "../lib/schemas";
import { buildSampleDataset } from "./sample-data/dataset";

const year = Number(process.env.SAMPLE_YEAR) || Number(todayManila().slice(0, 4));
const outDir = path.resolve(process.cwd(), "public", "sample");
const { files } = buildSampleDataset(year);

// The written files must pass the app's own validator, exactly as an upload would.
function check<K extends keyof typeof files>(kind: K) {
  const text = files[kind];
  const result = validateCsv(kind, text);
  if (!result.ok) throw new Error(`${kind}.csv failed validation: ${JSON.stringify(result.errors)}`);
  const mb = new TextEncoder().encode(text).length / 1024 / 1024;
  console.log(`${kind}.csv: ${result.rows.length} rows, ${mb.toFixed(2)} MB (limits: ${CSV_LIMITS.maxRows} rows, 5 MB)`);
  return result.rows;
}
const parsed = {
  roster: check("roster"),
  attendance: check("attendance"),
  catalog: check("catalog"),
  calendar: check("calendar"),
};

mkdirSync(outDir, { recursive: true });
for (const [kind, text] of Object.entries(files)) writeFileSync(path.join(outDir, `${kind}.csv`), text);

// Sanity-check the Sep 30 at-risk share against the spec's 15-25% target.
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
