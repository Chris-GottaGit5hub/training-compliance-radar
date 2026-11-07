import { buttonClass } from "./ui";

export function Header({
  canSummarize,
  disabledReason,
  loading,
  onSummary,
}: {
  canSummarize: boolean;
  disabledReason: string;
  loading: boolean;
  onSummary: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8 text-indigo-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 12 18 6" strokeLinecap="round" />
          </svg>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-slate-900">
              Training Compliance Radar
            </h1>
            <p className="text-sm text-slate-600">
              Early warning for the one-training-per-year rule
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSummary}
          disabled={!canSummarize || loading}
          title={canSummarize ? undefined : disabledReason}
          className={buttonClass("secondary")}
        >
          {loading ? "Writing summary…" : "Executive summary"}
        </button>
      </div>
      <p
        role="note"
        className="border-t border-indigo-100 bg-indigo-50 px-4 py-2 text-center text-sm text-indigo-900"
      >
        <span aria-hidden="true">🔒 </span>
        Your files never leave this browser; only unit-level counts are sent to AI.
      </p>
    </header>
  );
}
