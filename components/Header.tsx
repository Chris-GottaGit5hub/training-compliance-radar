/** Navy header (spec §6, Civic Ledger look): the app name is the largest text on the page. */
export function Header({
  canSummarize,
  loading,
  onSummary,
}: {
  canSummarize: boolean;
  loading: boolean;
  onSummary: () => void;
}) {
  return (
    <header className="bg-indigo-600 text-white print:bg-white print:text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <svg aria-hidden="true" viewBox="0 0 34 34" className="h-11 w-11 shrink-0" fill="none" strokeWidth="2">
            <circle cx="17" cy="17" r="15" stroke="currentColor" />
            <circle cx="17" cy="17" r="8" stroke="#f2b04b" />
            <path d="M17 17 28 9" stroke="#f2b04b" strokeLinecap="round" />
          </svg>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-[32px]">
              Training Compliance Radar
            </h1>
            <p className="text-sm text-indigo-100 print:text-slate-600">
              Spotting Employees at Risk of Missing Their Annual Training, Months Early
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSummary}
          disabled={!canSummarize || loading}
          title={canSummarize ? undefined : "Load data and rules first"}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-white bg-white px-4 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-indigo-300 disabled:bg-transparent disabled:text-indigo-200 print:hidden"
        >
          {loading ? "Writing Summary…" : "Executive Summary"}
        </button>
      </div>
      <p
        role="note"
        className="border-t border-indigo-500 bg-indigo-700 px-4 py-2 text-center text-sm text-indigo-50 print:hidden"
      >
        Your files never leave this browser; only unit-level counts are sent to AI.
      </p>
    </header>
  );
}
