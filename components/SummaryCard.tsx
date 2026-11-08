import { useEffect, useRef } from "react";
import { buildTemplateSummary, type Analysis } from "@/lib/analysis";
import type { RulesConfig } from "@/lib/schemas";
import { CopyButton } from "./CopyButton";
import { SummaryCharts } from "./SummaryCharts";
import { downloadTextFile } from "./download";
import type { AiActions } from "./useAiActions";
import { Banner, Card, buttonClass } from "./ui";

function TemplateSummary({ text, asOfDate }: { text: string; asOfDate: string }) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{text}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} label="Copy summary" />
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() =>
            downloadTextFile(`executive-summary-${asOfDate}.txt`, text, "text/plain;charset=utf-8")
          }
        >
          Download .txt
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Template summary built from the compliance engine&apos;s numbers. No AI was used.
      </p>
    </div>
  );
}

/** Executive summary written by the AI from org-level numbers only. */
export function SummaryCard({
  ai,
  analysis,
  config,
}: {
  ai: AiActions;
  analysis: Analysis;
  config: RulesConfig;
}) {
  const asOfDate = config.asOfDate;
  const { summaryState: state } = ai;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Card>
      <section aria-labelledby="executive-summary-title" id="executive-summary">
        <h2
          id="executive-summary-title"
          ref={heading}
          tabIndex={-1}
          className="mb-3 text-lg font-semibold text-slate-900 focus:outline-none"
        >
          Executive summary
        </h2>
        <div aria-live="polite" className="space-y-3">
          {state.status === "loading" && (
            <p className="text-sm text-slate-600">Writing the summary…</p>
          )}
          {state.status === "error" && (
            <>
              <Banner tone="error">
                {state.message}{" "}
                <button type="button" onClick={ai.summary} className="font-medium underline">
                  Retry
                </button>
              </Banner>
              <Banner tone="info">
                The AI is unavailable, so here is a template summary built from your numbers.
              </Banner>
              <TemplateSummary text={buildTemplateSummary(analysis, config)} asOfDate={asOfDate} />
            </>
          )}
          {state.status === "done" && (
            <>
              {state.data.warning && (
                <Banner tone="warning">
                  Some figures in this summary could not be checked against your data. Verify the
                  numbers before sharing.
                </Banner>
              )}
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">
                {state.data.summary}
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={state.data.summary} label="Copy summary" />
                <button
                  type="button"
                  className={buttonClass("secondary")}
                  onClick={() =>
                    downloadTextFile(
                      `executive-summary-${asOfDate}.txt`,
                      state.data.summary,
                      "text/plain;charset=utf-8",
                    )
                  }
                >
                  Download .txt
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Written by AI from unit-level counts only. Figures come from the compliance
                engine.
              </p>
            </>
          )}
        </div>

        <h3 className="mb-3 mt-6 text-base font-semibold text-slate-900">Key figures at a glance</h3>
        <SummaryCharts analysis={analysis} config={config} />
        <p className="mt-3 text-xs text-slate-500">
          Charts are drawn by the compliance engine from your data, as of {asOfDate}. They do not
          depend on the AI.
        </p>
      </section>
    </Card>
  );
}
