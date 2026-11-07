import { useId } from "react";
import type { FileState } from "@/lib/analysis";
import { ErrorList } from "./ErrorList";
import { Banner, buttonClass } from "./ui";

interface Props {
  label: string;
  required: boolean;
  columns: string;
  state: FileState<unknown>;
  pending: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function UploadBox({ label, required, columns, state, pending, onFile, onClear }: Props) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div>
        <h3 className="font-medium text-slate-900">
          {label}{" "}
          <span className="text-xs font-normal text-slate-500">
            {required ? "(required)" : "(optional)"}
          </span>
        </h3>
        <p className="mt-1 text-xs text-slate-500">Columns: {columns}</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="peer sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // lets the same file be chosen again
            if (file) onFile(file);
          }}
        />
        <label
          htmlFor={inputId}
          className={`${buttonClass("secondary")} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600`}
        >
          {state.status === "ok" ? "Replace file" : `Choose ${label.toLowerCase()} CSV`}
        </label>
        {state.status === "ok" && (
          <button type="button" onClick={onClear} className={buttonClass("secondary")}>
            Remove
          </button>
        )}
      </div>

      <div aria-live="polite" className="text-sm">
        {pending && <p className="text-slate-600">Reading file…</p>}
        {!pending && state.status === "empty" && (
          <p className="text-slate-500">No file chosen yet.</p>
        )}
        {!pending && state.status === "ok" && (
          <div className="space-y-2">
            <p className="text-emerald-800">
              <span aria-hidden="true">✓ </span>
              {state.fileName} — {state.rows.length.toLocaleString("en-PH")} rows
            </p>
            {state.warnings.map((warning) => (
              <Banner key={warning} tone="warning">
                {warning}
              </Banner>
            ))}
          </div>
        )}
      </div>
      {!pending && state.status === "error" && (
        <>
          <p className="text-sm text-slate-700">{state.fileName}</p>
          <ErrorList errors={state.errors} total={state.totalErrors} />
        </>
      )}
    </div>
  );
}
