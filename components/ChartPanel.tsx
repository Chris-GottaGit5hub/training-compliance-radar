import type { ReactNode } from "react";
import type { StatusKey } from "@/lib/analysis";

// Same hues as the rest of the app: indigo accent, amber for risk, slate for the rest.
export const FILL: Record<StatusKey, string> = {
  compliant: "#4f46e5",
  atRisk: "#d97706",
  exempt: "#64748b",
  excluded: "#94a3b8",
  notCovered: "#cbd5e1",
};
export const SWATCH: Record<StatusKey, string> = {
  compliant: "bg-indigo-600",
  atRisk: "bg-amber-600",
  exempt: "bg-slate-500",
  excluded: "bg-slate-400",
  notCovered: "bg-slate-300",
};
export const INDIGO = "#4f46e5";
export const SLATE = "#64748b";
export const AMBER = "#d97706";

export const shorten = (name: string): string => (name.length > 22 ? `${name.slice(0, 21)}…` : name);
export const percentLabel = (value: unknown): string => (typeof value === "number" ? `${value}%` : "");

export function ChartPanel({
  title,
  description,
  summary,
  children,
}: {
  title: string;
  description: string;
  /** Text alternative for screen readers. */
  summary: string;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-lg border border-slate-200 p-4">
      <figcaption className="mb-2">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </figcaption>
      <div role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
    </figure>
  );
}

