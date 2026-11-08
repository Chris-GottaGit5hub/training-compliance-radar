import type { CsvKind } from "@/lib/schemas";
import { UploadBox } from "./UploadBox";
import type { SampleStatus, useRadarState } from "./useRadarState";
import { Banner, Card, StepHeading, buttonClass } from "./ui";

type RadarState = ReturnType<typeof useRadarState>;

const BOXES: { kind: CsvKind; label: string; required: boolean; columns: string }[] = [
  {
    kind: "roster",
    label: "Roster",
    required: true,
    columns:
      "employee_id, name, unit, position, employment_type, hire_date, separation_date, licensed. Optional: pay_grade, group, sector",
  },
  {
    kind: "attendance",
    label: "Attendance",
    required: true,
    columns: "employee_id, training_title, training_date, hours, delivery, cost",
  },
  {
    kind: "catalog",
    label: "Course catalog",
    required: false,
    columns:
      "course_id, title, skill_area, duration_minutes, provider, url, cost_per_head. Optional: unlicensed_fee, recommended",
  },
];

function SamplePanel({ status, onLoad }: { status: SampleStatus; onLoad: () => void }) {
  const loading = status.state === "loading";
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-indigo-950">No files handy?</p>
        <p className="text-sm text-indigo-900">
          Load a synthetic agency: about 300 employees, 12 units and a 26-course catalog.
        </p>
      </div>
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        className={`${buttonClass("primary")} shrink-0 px-5 py-2.5`}
      >
        {loading ? "Loading sample data…" : "Load sample data"}
      </button>
      {status.state === "error" && (
        <div className="sm:basis-full">
          <Banner tone="error">
            {status.message}{" "}
            <button type="button" onClick={onLoad} className="font-medium underline">
              Retry
            </button>
          </Banner>
        </div>
      )}
    </div>
  );
}

export function DataStep({ state }: { state: RadarState }) {
  const { files, pending, sample, ready, loadFile, clearFile, loadSample } = state;
  return (
    <Card>
      <section aria-labelledby="step-data-title" id="step-data">
        <StepHeading
          id="step-data-title"
          step={1}
          title="Data"
          description="Upload your CSV files, or try the sample data. Files are read in this browser only."
        />
        <SamplePanel status={sample} onLoad={loadSample} />
        <div className="grid gap-4 md:grid-cols-3">
          {BOXES.map(({ kind, ...box }) => (
            <UploadBox
              key={kind}
              {...box}
              state={files[kind]}
              pending={pending[kind] === true}
              onFile={(file) => loadFile(kind, file)}
              onClear={() => clearFile(kind)}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600" aria-live="polite">
          {ready
            ? "Roster and attendance loaded. Review the rules below."
            : "Roster and attendance are required. The catalog is optional; it enables cost to close."}
        </p>
      </section>
    </Card>
  );
}
