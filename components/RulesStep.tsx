import { dataYear, withYear } from "@/lib/analysis";
import { EMPLOYMENT_TYPES, type EmploymentType, type RulesConfig } from "@/lib/schemas";
import type { useRadarState } from "./useRadarState";
import { DateField, NumberField } from "./RuleFields";
import { Banner, Card, StepHeading, buttonClass } from "./ui";

type RadarState = ReturnType<typeof useRadarState>;
type Errors = RadarState["issues"];

const TYPE_LABELS: Record<EmploymentType, string> = {
  regular: "Regular",
  contractual: "Contractual",
  casual: "Casual",
};

function RulesForm({
  config,
  errors,
  yearHint,
  onChange,
  onReset,
}: {
  config: RulesConfig;
  errors: Errors;
  yearHint: string | null;
  onChange: (config: RulesConfig) => void;
  onReset: () => void;
}) {
  const patch = (changes: Partial<RulesConfig>) => onChange({ ...config, ...changes });
  const toggleType = (type: EmploymentType, on: boolean) =>
    patch({
      coveredTypes: EMPLOYMENT_TYPES.filter((t) =>
        t === type ? on : config.coveredTypes.includes(t),
      ),
    });

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="space-y-5"
      aria-label="Compliance rules"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          id="rules-year"
          label="Year"
          value={config.year}
          step={1}
          error={errors.year}
          onChange={(year) => onChange(withYear(config, year))}
        />
        <DateField
          id="rules-asof"
          label="As-of date"
          value={config.asOfDate}
          hint="Status is evaluated as of this date."
          error={errors.asOfDate}
          onChange={(asOfDate) => patch({ asOfDate })}
        />
        <DateField
          id="rules-cutoff"
          label="Late-hire cutoff"
          value={config.lateHireCutoff}
          hint="Hired on or after this date: exempt."
          error={errors.lateHireCutoff}
          onChange={(lateHireCutoff) => patch({ lateHireCutoff })}
        />
        <NumberField
          id="rules-minhours"
          label="Minimum hours"
          value={config.minHours}
          step={0.5}
          hint="A training counts only if it lasts at least this long."
          error={errors.minHours}
          onChange={(minHours) => patch({ minHours })}
        />
        <NumberField
          id="rules-budget"
          label="Budget (₱)"
          value={config.budgetPhp}
          step={100}
          hint="Leave at 0 to hide the budget comparison."
          error={errors.budgetPhp}
          onChange={(budgetPhp) => patch({ budgetPhp })}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset aria-describedby={errors.coveredTypes ? "rules-types-error" : undefined}>
          <legend className="mb-1 text-sm font-medium text-slate-800">
            Covered employment types
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {EMPLOYMENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={config.coveredTypes.includes(type)}
                  onChange={(event) => toggleType(type, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                />
                {TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          {errors.coveredTypes && (
            <p id="rules-types-error" className="mt-1 text-xs font-medium text-red-700">
              {errors.coveredTypes}
            </p>
          )}
        </fieldset>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              role="switch"
              checked={config.elearningCounts}
              onChange={(event) => patch({ elearningCounts: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            E-learning counts toward the requirement
          </label>
          <p className="mt-1 text-xs text-slate-500">
            When off, e-learning is ignored and licensed staff are priced on in-house courses.
          </p>
        </div>
      </div>

      {yearHint && <Banner tone="info">{yearHint}</Banner>}

      <button type="button" onClick={onReset} className={buttonClass("secondary")}>
        Reset to defaults
      </button>
    </form>
  );
}

export function RulesStep({ state }: { state: RadarState }) {
  const { config, issues, roster, setConfig } = state;
  const latest = roster ? dataYear(roster) : null;
  const yearHint =
    config && latest !== null && latest !== config.year
      ? `The latest hire date in your roster is in ${latest}. Set Year to ${latest} if that is the year you are reviewing.`
      : null;

  return (
    <Card>
      <section aria-labelledby="step-rules-title" id="step-rules">
        <StepHeading
          id="step-rules-title"
          step={2}
          title="Rules"
          description="Defaults follow the spec; change anything and the dashboard updates instantly."
        />
        {config ? (
          <RulesForm
            config={config}
            errors={issues}
            yearHint={yearHint}
            onChange={setConfig}
            onReset={() => setConfig(null)}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Load your files or the sample data in step 1 to set the rules.
          </p>
        )}
      </section>
    </Card>
  );
}
