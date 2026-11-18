import { buttonClass } from "./ui";

/** Folded steps 1 and 2 (spec §6, v2.10): what is loaded, the key rules, and a button to open them. */
export function SetupSummaryBar({
  data,
  rules,
  onShow,
}: {
  data: string;
  rules: string;
  onShow: () => void;
}) {
  return (
    <section
      aria-labelledby="setup-summary-title"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0">
        <h2 id="setup-summary-title" className="font-semibold text-slate-900">
          Data and Rules
        </h2>
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">Data:</span> {data}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">Rules:</span> {rules}
        </p>
      </div>
      <button
        type="button"
        onClick={onShow}
        aria-expanded={false}
        aria-controls="setup-steps"
        className={`${buttonClass("secondary")} shrink-0`}
      >
        Show Data and Rules
      </button>
    </section>
  );
}

/** Shown above the open steps when they could be folded again. */
export function SetupHideButton({ onHide }: { onHide: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onHide}
        aria-expanded={true}
        aria-controls="setup-steps"
        className={buttonClass("secondary")}
      >
        Hide Data and Rules
      </button>
    </div>
  );
}
