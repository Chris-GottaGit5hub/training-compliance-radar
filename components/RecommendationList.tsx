import { linkedinSearchUrl } from "@/lib/payload";
import type { CatalogRow } from "@/lib/schemas";
import type { UnitRecommendation } from "./useAiActions";
import { Banner } from "./ui";

const LINK =
  "font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900";

/**
 * Catalog courses picked for a unit (by the AI, or by the no-AI template when `template`),
 * or a LinkedIn Learning search when none matched.
 */
export function RecommendationList({
  rec,
  catalog,
  searchQuery,
  template = false,
}: {
  rec: UnitRecommendation;
  catalog: CatalogRow[];
  searchQuery: string;
  template?: boolean;
}) {
  const courses = rec.courseIds
    .map((id) => catalog.find((c) => c.course_id === id))
    .filter((c): c is CatalogRow => c !== undefined);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-4">
      <h4 className="font-semibold text-slate-900">
        {template ? "Recommended courses (template)" : "Recommended courses"}
      </h4>
      {template && (
        <Banner tone="info">
          The AI is unavailable, so these are template picks from your catalog, matched on course
          titles. No AI was used. Use Retry above for AI recommendations.
        </Banner>
      )}
      {rec.fallbackSearch || courses.length === 0 ? (
        <p className="text-sm text-slate-700">
          No catalog course was a confident match.{" "}
          <a
            href={linkedinSearchUrl(searchQuery)}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Search LinkedIn Learning for “{searchQuery}”
          </a>
          .
        </p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-800">
          {courses.map((c) => (
            <li key={c.course_id}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {c.title}
                </a>
              ) : (
                <span className="font-medium">{c.title}</span>
              )}{" "}
              <span className="text-slate-500">
                · {c.provider === "linkedin_learning" ? "LinkedIn Learning" : "In-house"} ·{" "}
                {c.duration_minutes} min
              </span>
            </li>
          ))}
        </ul>
      )}
      {rec.rationale && <p className="text-sm text-slate-600">{rec.rationale}</p>}
    </div>
  );
}
