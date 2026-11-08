import { useId, useState, type ReactNode } from "react";
import type { AtRiskRow } from "@/lib/analysis";
import type { UnitSummary } from "@/lib/engine";
import { topPositions, unitKey } from "@/lib/payload";
import { buildTemplateMemo, buildTemplateRecommendation } from "@/lib/analysis";
import type { CatalogRow, MemoRequest, RulesConfig } from "@/lib/schemas";
import { MemoView } from "./MemoView";
import { RecommendationList } from "./RecommendationList";
import type { AiActions } from "./useAiActions";
import { Banner, buttonClass, inputClass } from "./ui";

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function RetryBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner tone="error">
      {message}{" "}
      <button type="button" onClick={onRetry} className="font-medium underline">
        Retry
      </button>
    </Banner>
  );
}

/** Recommend courses, generate memo, export: the actions and results for one unit. */
export function AiPanel({
  unit,
  rows,
  catalog,
  ai,
  config,
  exportButton,
}: {
  unit: UnitSummary;
  rows: AtRiskRow[];
  catalog: CatalogRow[] | null;
  ai: AiActions;
  config: RulesConfig;
  exportButton: ReactNode;
}) {
  const toneId = useId();
  const [tone, setTone] = useState<MemoRequest["tone"]>("formal");
  const memo = ai.memos[unit.unit] ?? { status: "idle" as const };
  const recs = ai.recommendations;
  // When the AI call failed, show labeled template picks instead (spec §6).
  const usingTemplate = recs.status === "error" && catalog !== null && unit.atRisk > 0;
  const rec = usingTemplate
    ? buildTemplateRecommendation(unit, rows, catalog, config)
    : recs.status === "done"
      ? recs.data[unitKey(unit.unit)]
      : undefined;
  const asOfDate = config.asOfDate;
  const recCourses =
    rec && catalog
      ? rec.courseIds
          .map((id) => catalog.find((c) => c.course_id === id))
          .filter((c): c is CatalogRow => c !== undefined)
      : [];
  const memoLoading = memo.status === "loading";
  const recLoading = recs.status === "loading";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={ai.recommend}
          disabled={!ai.hasCatalog || recLoading}
          className={buttonClass("secondary")}
        >
          {recLoading && <Spinner />}
          {recLoading ? "Recommending…" : "Recommend courses"}
        </button>
        <div>
          <label htmlFor={toneId} className="mb-1 block text-xs font-medium text-slate-600">
            Memo tone
          </label>
          <select
            id={toneId}
            value={tone}
            onChange={(event) => setTone(event.target.value as MemoRequest["tone"])}
            className={`${inputClass} w-auto py-1.5`}
          >
            <option value="formal">Formal</option>
            <option value="friendly">Friendly</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => ai.memo(unit.unit, tone)}
          disabled={memoLoading || unit.atRisk === 0}
          className={buttonClass("primary")}
        >
          {memoLoading && <Spinner />}
          {memoLoading ? "Generating…" : "Generate memo"}
        </button>
        {exportButton}
      </div>
      {!ai.hasCatalog && (
        <p className="text-xs text-slate-500">
          Upload a course catalog in step 1 to enable course recommendations.
        </p>
      )}

      {recs.status === "error" && <RetryBanner message={recs.message} onRetry={ai.recommend} />}
      {rec && catalog && (
        <RecommendationList
          template={usingTemplate}
          rec={rec}
          catalog={catalog}
          searchQuery={topPositions(rows, unit.unit)[0] ?? unit.unit}
        />
      )}

      {memo.status === "error" && (
        <>
          <RetryBanner message={memo.message} onRetry={() => ai.memo(unit.unit, tone)} />
          <MemoView
            template
            memo={buildTemplateMemo(unit, recCourses, config, tone)}
            rows={rows}
            unit={unit.unit}
            asOfDate={asOfDate}
          />
        </>
      )}
      {memo.status === "done" && (
        <MemoView memo={memo.data} rows={rows} unit={unit.unit} asOfDate={asOfDate} />
      )}
    </div>
  );
}
