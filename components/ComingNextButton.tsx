import { useId } from "react";
import { buttonClass } from "./ui";

/** Disabled placeholder for features that need the AI routes (built next). */
export function ComingNextButton({ label }: { label: string }) {
  const tooltipId = useId();
  return (
    <span
      className="group relative inline-flex"
      tabIndex={0}
      role="group"
      aria-label={`${label} (coming next)`}
      aria-describedby={tooltipId}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        tabIndex={-1}
        className={`${buttonClass("secondary")} pointer-events-none`}
      >
        {label}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
      >
        Coming next
      </span>
    </span>
  );
}
