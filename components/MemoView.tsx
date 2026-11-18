import { memoFileName, memoLayout, memoPlainText, NO_ROUTE, type AtRiskRow } from "@/lib/analysis";
import type { CatalogRow, MemoResponse } from "@/lib/schemas";
import { CopyButton } from "./CopyButton";
import { downloadTextFile } from "./download";
import { Banner, buttonClass } from "./ui";

/**
 * Shows a generated memo (spec §6, v2.13): bold subject, justified paragraphs, a numbered table
 * of each person's assigned course and deadline, and Course Access. Names are merged locally.
 */
export function MemoView({
  memo,
  rows,
  unit,
  asOfDate,
  catalog,
  courses,
  template = false,
}: {
  memo: MemoResponse;
  rows: AtRiskRow[];
  unit: string;
  asOfDate: string;
  catalog: CatalogRow[] | null;
  /** The unit's recommended courses (AI or template picks); unassigned ones show as alternatives. */
  courses: CatalogRow[];
  /** True for the no-AI fallback draft. */
  template?: boolean;
}) {
  const layout = memoLayout(memo.body, rows, catalog, courses);
  const text = memoPlainText(memo.subject, layout);
  const paragraph = (p: string, i: number) => (
    <p key={i} className="whitespace-pre-line text-justify">
      {p}
    </p>
  );

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
        {template ? "Memo Draft (Template)" : "Memo Draft"}
      </h4>
      <article className="space-y-3 rounded-md bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 sm:p-6">
        <p>
          <span className="font-semibold text-slate-900">Subject:</span> {memo.subject}
        </p>
        {layout.intro.map(paragraph)}
        {layout.people.length > 0 && (
          <div className="max-h-[28rem] overflow-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Each employee&apos;s assigned course and deadline</caption>
              <thead className="sticky top-0 bg-indigo-50 text-slate-800">
                <tr>
                  <th scope="col" className="w-12 px-3 py-2 font-medium">No.</th>
                  <th scope="col" className="px-3 py-2 font-medium">Employee Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Assigned Course</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {layout.people.map((p) => (
                  <tr key={p.n} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.n}</td>
                    <th scope="row" className="px-3 py-2 font-normal text-slate-900">{p.name}</th>
                    <td className="px-3 py-2">{p.role}</td>
                    <td className={`px-3 py-2 ${p.course === NO_ROUTE ? "font-medium text-red-700" : ""}`}>
                      {p.course}
                      {p.paid && <em className="text-slate-600"> (paid)</em>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{p.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {layout.courses.length > 0 && (
          <div>
            <p className="font-semibold text-slate-900">Course Access:</p>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              {layout.courses.map((c) => (
                <li key={c.title}>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-indigo-700">
                      {c.title}
                      {c.minutes ? ` (${c.minutes} mins)` : ""}
                    </a>
                  ) : (
                    <>
                      {c.title}
                      {c.minutes ? ` (${c.minutes} mins)` : ""}
                    </>
                  )}
                  {c.optional && <em className="text-slate-600"> (optional alternative)</em>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {layout.closing.map(paragraph)}
      </article>
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
