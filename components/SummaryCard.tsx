import { useEffect, useRef } from "react";
import { CopyButton } from "./CopyButton";
import { downloadTextFile } from "./download";
import type { AiActions } from "./useAiActions";
import { Banner, Card, buttonClass } from "./ui";

/** Executive summary written by the AI from org-level numbers only. */
export function SummaryCard({ ai, asOfDate }: { ai: AiActions; asOfDate: string }) {
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
            <Banner tone="error">
              {state.message}{" "}
              <button type="button" onClick={ai.summary} className="font-medium underline">
                Retry
              </button>
            </Banner>
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
      </section>
    </Card>
  );
}
