export type AppTab = "radar" | "calendar";

const TABS: { id: AppTab; label: string }[] = [
  { id: "radar", label: "Radar" },
  { id: "calendar", label: "Training calendar" },
];

/** Two top-level views of the same data. Tab panels are rendered by the parent. */
export function AppTabs({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <div role="tablist" aria-label="Views" className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const next = TABS[(TABS.findIndex((t) => t.id === tab.id) + 1) % TABS.length];
                onChange(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
              selected
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
