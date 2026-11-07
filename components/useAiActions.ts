"use client";

import { useCallback, useState } from "react";
import { atRiskEmployees, type Analysis } from "@/lib/analysis";
import { postAi } from "@/lib/api/client";
import {
  buildMemoPayload,
  buildRecommendPayload,
  buildSummaryPayload,
  unitKey,
} from "@/lib/payload";
import {
  memoResponseSchema,
  recommendResponseSchema,
  summaryResponseSchema,
  type CatalogRow,
  type MemoRequest,
  type MemoResponse,
  type RecommendResponse,
  type RosterRow,
  type RulesConfig,
  type SummaryResponse,
} from "@/lib/schemas";

export type Async<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "error"; message: string };

export type UnitRecommendation = RecommendResponse["recommendations"][number];

interface Store {
  /** Results belong to one analysis; a new analysis (data or rules changed) clears them. */
  analysis: Analysis | null;
  recommend: Async<Record<string, UnitRecommendation>>;
  memos: Record<string, Async<MemoResponse>>;
  summary: Async<SummaryResponse>;
}

const emptyStore = (analysis: Analysis | null): Store => ({
  analysis,
  recommend: { status: "idle" },
  memos: {},
  summary: { status: "idle" },
});

interface Inputs {
  analysis: Analysis | null;
  roster: RosterRow[] | null;
  catalog: CatalogRow[] | null;
  config: RulesConfig | null;
}

/** AI actions. Only aggregates are sent; names are merged into memos by the UI, locally. */
export function useAiActions({ analysis, roster, catalog, config }: Inputs) {
  const [store, setStore] = useState<Store>(() => emptyStore(null));
  const [notConfigured, setNotConfigured] = useState(false);
  const live = store.analysis === analysis ? store : emptyStore(analysis);

  const patch = useCallback(
    (forAnalysis: Analysis | null, change: (s: Store) => Partial<Store>) =>
      setStore((prev) => {
        const base = prev.analysis === forAnalysis ? prev : emptyStore(forAnalysis);
        return { ...base, ...change(base) };
      }),
    [],
  );

  const recommend = useCallback(async () => {
    if (!analysis || !roster || !catalog || !config) return;
    const payload = buildRecommendPayload(
      analysis.org.unitsRanked,
      atRiskEmployees(analysis.results, roster),
      catalog,
      config,
    );
    if (!payload) {
      patch(analysis, () => ({
        recommend: {
          status: "error",
          message:
            "Nothing to recommend: no unit has at-risk employees, or no catalog course meets the minimum hours.",
        },
      }));
      return;
    }
    patch(analysis, () => ({ recommend: { status: "loading" } }));
    const result = await postAi("/api/recommend", payload, recommendResponseSchema);
    if (!result.ok) {
      if (result.notConfigured) setNotConfigured(true);
      patch(analysis, () => ({ recommend: { status: "error", message: result.message } }));
      return;
    }
    const byUnit = Object.fromEntries(result.data.recommendations.map((r) => [r.unit, r]));
    patch(analysis, () => ({ recommend: { status: "done", data: byUnit } }));
  }, [analysis, roster, catalog, config, patch]);

  const memo = useCallback(
    async (unitName: string, tone: MemoRequest["tone"]) => {
      const unit = analysis?.org.unitsRanked.find((u) => u.unit === unitName);
      if (!analysis || !unit || !config) return;
      const recs = live.recommend.status === "done" ? live.recommend.data[unitKey(unitName)] : undefined;
      const courses = (recs?.courseIds ?? [])
        .map((id) => catalog?.find((c) => c.course_id === id))
        .filter((c): c is CatalogRow => c !== undefined);
      const setMemo = (value: Async<MemoResponse>) =>
        patch(analysis, (s) => ({ memos: { ...s.memos, [unitName]: value } }));

      setMemo({ status: "loading" });
      const result = await postAi(
        "/api/memo",
        buildMemoPayload(unit, courses, config, tone),
        memoResponseSchema,
      );
      if (!result.ok) {
        if (result.notConfigured) setNotConfigured(true);
        setMemo({ status: "error", message: result.message });
        return;
      }
      setMemo({ status: "done", data: result.data });
    },
    [analysis, catalog, config, live.recommend, patch],
  );

  const summary = useCallback(async () => {
    if (!analysis || !config) return;
    patch(analysis, () => ({ summary: { status: "loading" } }));
    const result = await postAi(
      "/api/summary",
      buildSummaryPayload(analysis.org, analysis.cost, config),
      summaryResponseSchema,
    );
    if (!result.ok) {
      if (result.notConfigured) setNotConfigured(true);
      patch(analysis, () => ({ summary: { status: "error", message: result.message } }));
      return;
    }
    patch(analysis, () => ({ summary: { status: "done", data: result.data } }));
  }, [analysis, config, patch]);

  return {
    notConfigured,
    recommendations: live.recommend,
    memos: live.memos,
    summaryState: live.summary,
    hasCatalog: catalog !== null && catalog.length > 0,
    recommend,
    memo,
    summary,
  };
}

export type AiActions = ReturnType<typeof useAiActions>;
