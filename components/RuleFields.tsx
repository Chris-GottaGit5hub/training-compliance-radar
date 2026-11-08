import { Field, inputClass } from "./ui";

const describedBy = (id: string, error?: string, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function NumberField({
  id,
  label,
  value,
  step,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  step: number;
  hint?: string;
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, Boolean(hint))}
        onChange={(event) =>
          onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))
        }
        className={inputClass}
      />
    </Field>
  );
}

const TARGET_DATES = ["Mar 31", "Jun 30", "Sep 30", "Nov 30"] as const;

export function TargetFields({
  targets,
  error,
  onChange,
}: {
  targets: number[];
  error?: string;
  onChange: (targets: number[]) => void;
}) {
  return (
    <fieldset aria-describedby={error ? "rules-targets-error" : "rules-targets-hint"}>
      <legend className="mb-1 text-sm font-medium text-slate-800">Trained-share targets (%)</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TARGET_DATES.map((date, i) => (
          <label key={date} className="text-xs text-slate-600">
            By {date}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={1}
              value={Number.isNaN(targets[i]) ? "" : targets[i]}
              aria-invalid={error ? true : undefined}
              onChange={(event) =>
                onChange(
                  targets.map((t, j) =>
                    j === i ? (event.target.value === "" ? Number.NaN : Number(event.target.value)) : t,
                  ),
                )
              }
              className={`${inputClass} mt-1`}
            />
          </label>
        ))}
      </div>
      <p id="rules-targets-hint" className="mt-1 text-xs text-slate-500">
        Share of in-scope staff who should be trained by each date. Nov 30 is the internal target.
      </p>
      {error && (
        <p id="rules-targets-error" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function DateField({
  id,
  label,
  value,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        type="date"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, Boolean(hint))}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

