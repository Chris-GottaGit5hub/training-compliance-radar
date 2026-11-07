import type { CsvIssue } from "@/lib/schemas";

export function ErrorList({ errors, total }: { errors: CsvIssue[]; total: number }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-medium">
        {total === 1 ? "1 problem found" : `${total} problems found`} — nothing was loaded.
      </p>
      <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5">
        {errors.map((error, i) => (
          <li key={i}>
            {error.row === null ? error.message : `Row ${error.row}: ${error.message}`}
          </li>
        ))}
      </ul>
      {total > errors.length && (
        <p className="mt-1 text-xs">
          Showing the first {errors.length} of {total}. Fix these and upload again.
        </p>
      )}
    </div>
  );
}
