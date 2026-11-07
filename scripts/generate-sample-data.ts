// Seeded synthetic data generator (spec §7). Writes public/sample/{roster,attendance,catalog}.csv.
// Usage: npm run sample-data   (optional: SAMPLE_YEAR=2026 to pin the year)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backtest, evaluateRoster, summarizeOrg, todayManila } from "../lib/engine";
import {
  ATTENDANCE_COLUMNS,
  CATALOG_COLUMNS,
  ROSTER_COLUMNS,
  defaultRulesConfig,
  validateCsv,
  type CsvKind,
} from "../lib/schemas";
import { buildAttendance } from "./sample-data/attendance";
import { buildCatalog } from "./sample-data/catalog";
import { buildRoster } from "./sample-data/roster";
import { createRng } from "./sample-data/rng";

const SEED = 20260930;
const year = Number(process.env.SAMPLE_YEAR) || Number(todayManila().slice(0, 4));
const outDir = path.resolve(process.cwd(), "public", "sample");

function toCsv(columns: readonly string[], rows: object[]): string {
  const cell = (value: unknown): string => {
    const s = value === undefined || value === null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = rows.map((row) =>
    columns.map((c) => cell((row as Record<string, unknown>)[c])).join(","),
  );
  return [columns.join(","), ...lines].join("\n") + "\n";
}

const rng = createRng(SEED);
const roster = buildRoster(rng, year);
const attendance = buildAttendance(rng, roster, year);
const catalog = buildCatalog();

const files: [CsvKind, string][] = [
  ["roster", toCsv(ROSTER_COLUMNS, roster)],
  ["attendance", toCsv(ATTENDANCE_COLUMNS, attendance)],
  ["catalog", toCsv(CATALOG_COLUMNS, catalog)],
];

// The written files must pass the app's own validator.
for (const [kind, text] of files) {
  const result = validateCsv(kind, text);
  if (!result.ok) throw new Error(`${kind}.csv failed validation: ${JSON.stringify(result.errors)}`);
}

mkdirSync(outDir, { recursive: true });
for (const [kind, text] of files) writeFileSync(path.join(outDir, `${kind}.csv`), text);

// Sanity-check the Sep 30 at-risk share against the spec's 15-25% target.
const config = { ...defaultRulesConfig(`${year}-09-30`) };
const { results } = evaluateRoster(roster, attendance, config);
const org = summarizeOrg(results, roster, config);
const atRiskShare = org.atRisk / org.covered;
const bt = backtest(roster, attendance, config, `${year}-09-30`);

console.log(`Year ${year}: ${roster.length} employees, ${attendance.length} attendance rows, ${catalog.length} courses`);
console.log(
  `As of ${config.asOfDate}: covered ${org.covered}, compliant ${org.compliant}, at-risk ${org.atRisk} ` +
    `(${(atRiskShare * 100).toFixed(1)}%), exempt ${org.exempt}, excluded ${org.excluded}, not covered ${org.notCovered}`,
);
console.log(
  `Back-test: flagged ${bt.flaggedAtCheckpoint}, non-compliant at year end ${bt.nonCompliantAtYearEnd}, ` +
    `caught early ${bt.caughtEarly}, precision ${bt.precision?.toFixed(2)}, recall ${bt.recall?.toFixed(2)}`,
);
console.log(`Wrote ${outDir}`);

if (atRiskShare < 0.15 || atRiskShare > 0.25) {
  throw new Error(`At-risk share ${(atRiskShare * 100).toFixed(1)}% is outside the 15-25% target`);
}
