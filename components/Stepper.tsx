export type StepState = "done" | "current" | "locked";

export interface StepInfo {
  href: string;
  label: string;
  state: StepState;
}

export function Stepper({ steps }: { steps: StepInfo[] }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, i) => {
          const badge =
            step.state === "done"
              ? "bg-indigo-600 text-white"
              : step.state === "current"
                ? "border-2 border-indigo-600 text-indigo-700"
                : "border border-slate-300 text-slate-400";
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${badge}`}
              >
                {step.state === "done" ? "✓" : i + 1}
              </span>
              <span>{step.label}</span>
            </>
          );
          return (
            <li key={step.href}>
              {step.state === "locked" ? (
                <span
                  aria-disabled="true"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400"
                >
                  {content}
                </span>
              ) : (
                <a
                  href={step.href}
                  aria-current={step.state === "current" ? "step" : undefined}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
