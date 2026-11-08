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

/** Annual platform subscriptions and the expected external nominations (spec §2.4). */
export function BudgetItemFields({
  subscriptions,
  reserve,
  subscriptionsError,
  reserveError,
  onSubscriptions,
  onReserve,
}: {
  subscriptions: { name: string; amountPhp: number }[];
  reserve: number | undefined;
  subscriptionsError?: string;
  reserveError?: string;
  onSubscriptions: (value: { name: string; amountPhp: number }[]) => void;
  onReserve: (value: number | undefined) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-800">Other budget items (₱ per year)</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {subscriptions.map((s, i) => (
          <label key={s.name} className="text-xs text-slate-600">
            {s.name}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={500}
              value={Number.isNaN(s.amountPhp) ? "" : s.amountPhp}
              onChange={(event) =>
                onSubscriptions(
                  subscriptions.map((x, j) =>
                    j === i ? { ...x, amountPhp: event.target.value === "" ? Number.NaN : Number(event.target.value) } : x,
                  ),
                )
              }
              className={`${inputClass} mt-1`}
            />
          </label>
        ))}
        <label className="text-xs text-slate-600">
          External nominations (₱)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1000}
            placeholder="estimate"
            value={reserve ?? ""}
            aria-invalid={reserveError ? true : undefined}
            onChange={(event) => onReserve(event.target.value === "" ? undefined : Number(event.target.value))}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Subscriptions are estimates billed in January. Nominations are external trainings people choose
        that are not in the calendar; leave blank to estimate from this year&apos;s external attendance.
      </p>
      {(subscriptionsError || reserveError) && (
        <p className="mt-1 text-xs font-medium text-red-700">{subscriptionsError ?? reserveError}</p>
      )}
    </fieldset>
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

