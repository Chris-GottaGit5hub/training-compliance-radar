"use client";

import { useCallback, useState } from "react";
import { atRiskEmployees, type Analysis } from "@/lib/analysis";
import { postAi, type ApiResult } from "@/lib/api/client";
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
  type RosterRow,
  type RulesConfig,
  type SummaryResponse,
  type RecommendResponse,
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

const UNEXPECTED = "Something unexpected went wrong. Try again.";

/**
 * Runs one AI call and always ends in "done" or "error", never "loading": building the
 * payload, the request and the response handling are all inside the try.
 */
async function settle<T, R>(
  call: () => Promise<ApiResult<T> | { ok: false; message: string }>,
  map: (data: T) => R,
): Promise<Async<R>> {
  try {
    const result = await call();
    return result.ok
      ? { status: "done", data: map(result.data) }
      : { status: "error", message: result.message };
  } catch {
    return { status: "error", message: UNEXPECTED };
  }
}

interface Inputs {
  analysis: Analysis | null;
  roster: RosterRow[] | null;
  catalog: CatalogRow[] | null;
  config: RulesConfig | null;
}

/**
 * AI actions. Only aggregates are sent; names are merged into memos by the UI, locally.
 * Every action leaves a visible result or error, and nothing disables the buttons for good:
 * after a failure the user can always retry.
 */
export function useAiActions({ analysis, roster, catalog, config }: Inputs) {
  const [store, setStore] = useState<Store>(() => emptyStore(null));
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
    patch(analysis, () => ({ recommend: { status: "loading" } }));
    const state = await settle(
      async () => {
        const payload = buildRecommendPayload(
          analysis.org.unitsRanked,
          atRiskEmployees(analysis.results, roster),
          catalog,
          config,
        );
        if (!payload) {
          return {
            ok: false as const,
            message:
              "Nothing to recommend: no unit has at-risk employees, or no catalog course meets the minimum hours.",
          };
        }
        return postAi("/api/recommend", payload, recommendResponseSchema);
      },
      (data) => Object.fromEntries(data.recommendations.map((r) => [r.unit, r])),
    );
    patch(analysis, () => ({ recommend: state }));
  }, [analysis, roster, catalog, config, patch]);

  const memo = useCallback(
    async (unitName: string, tone: MemoRequest["tone"]) => {
      const unit = analysis?.org.unitsRanked.find((u) => u.unit === unitName);
      if (!analysis || !unit || !config) return;
      const recs = live.recommend.status === "done" ? live.recommend.data[unitKey(unitName)] : undefined;
      const setMemo = (value: Async<MemoResponse>) =>
        patch(analysis, (s) => ({ memos: { ...s.memos, [unitName]: value } }));

      setMemo({ status: "loading" });
      setMemo(
        await settle(
          async () => {
            const courses = (recs?.courseIds ?? [])
              .map((id) => catalog?.find((c) => c.course_id === id))
              .filter((c): c is CatalogRow => c !== undefined);
            return postAi(
              "/api/memo",
              buildMemoPayload(unit, courses, config, tone),
              memoResponseSchema,
            );
          },
          (data) => data,
        ),
      );
    },
    [analysis, catalog, config, live.recommend, patch],
  );

  const summary = useCallback(async () => {
    if (!analysis || !config) return;
    patch(analysis, () => ({ summary: { status: "loading" } }));
    const state = await settle(
      async () =>
        postAi(
          "/api/summary",
          buildSummaryPayload(analysis.org, analysis.cost, config),
          summaryResponseSchema,
        ),
      (data) => data,
    );
    patch(analysis, () => ({ summary: state }));
  }, [analysis, config, patch]);

  return {
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
