import { memoFileName, type AtRiskRow } from "@/lib/analysis";
import { mergeEmployeeList } from "@/lib/payload";
import type { MemoResponse } from "@/lib/schemas";
import { CopyButton } from "./CopyButton";
import { downloadTextFile } from "./download";
import { Banner, buttonClass } from "./ui";

/** Shows a generated memo with employee names merged in locally. */
export function MemoView({
  memo,
  rows,
  unit,
  asOfDate,
  template = false,
}: {
  memo: MemoResponse;
  rows: AtRiskRow[];
  unit: string;
  asOfDate: string;
  /** True for the no-AI fallback draft. */
  template?: boolean;
}) {
  const text = `Subject: ${memo.subject}\n\n${mergeEmployeeList(memo.body, rows)}`;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      {template && (
        <Banner tone="info">
          The AI is unavailable, so this is a template draft built from your numbers. Use Retry
          above for an AI-written version.
        </Banner>
      )}
      {memo.warning && (
        <Banner tone="warning">
          Some figures in this draft could not be checked against your data. Verify the numbers
          before sending.
        </Banner>
      )}
      <h4 className="font-semibold text-slate-900">
        {template ? "Memo draft (template)" : "Memo draft"}
      </h4>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-800">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} label="Copy memo" />
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() =>
            downloadTextFile(memoFileName(unit, asOfDate), text, "text/plain;charset=utf-8")
          }
        >
          Download .txt
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {template
          ? "Employee names were added in your browser. No AI was used for this draft."
          : "Employee names were added in your browser; the AI only saw unit-level counts."}
      </p>
    </div>
  );
}
