import { formatDeadline } from "@/lib/ai/finalize";
import type { CatalogRow } from "@/lib/schemas";
import type { AtRiskRow } from "./analysis";
import { NO_ROUTE } from "./assign";

const TOKEN = "{{EMPLOYEE_LIST}}";
const PAID = " (paid)";

export interface MemoPerson {
  n: number;
  name: string;
  role: string;
  course: string;
  paid: boolean;
  deadline: string;
}

export interface MemoCourse {
  title: string;
  minutes?: number;
  url?: string;
  /** True for recommended courses nobody in the list is assigned. */
  optional: boolean;
}

export interface MemoLayout {
  intro: string[];
  people: MemoPerson[];
  courses: MemoCourse[];
  closing: string[];
}

const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

/**
 * Spec §6 (v2.13): the memo as paragraphs, a numbered table of people, and Course Access.
 * Runs in the browser; names are merged here and never sent anywhere.
 */
export function memoLayout(
  body: string,
  rows: readonly AtRiskRow[],
  catalog: readonly CatalogRow[] | null,
  recommended: readonly CatalogRow[],
): MemoLayout {
  const at = body.indexOf(TOKEN);
  const before = at < 0 ? body : body.slice(0, at);
  const after = at < 0 ? "" : body.slice(at + TOKEN.length).split(TOKEN).join("");

  const people = rows.map((r, i): MemoPerson => {
    const raw = r.recommendedCourse ?? "—";
    const paid = raw.endsWith(PAID);
    return {
      n: i + 1,
      name: r.name,
      role: r.position,
      course: paid ? raw.slice(0, -PAID.length) : raw,
      paid,
      deadline: r.completeBy ? formatDeadline(r.completeBy) : "—",
    };
  });

  const byTitle = new Map((catalog ?? []).map((c) => [c.title.toLowerCase(), c]));
  const info = (title: string, optional: boolean): MemoCourse => {
    const c = byTitle.get(title.toLowerCase());
    return { title, minutes: c?.duration_minutes, url: c?.url, optional };
  };
  const assigned = [...new Set(people.map((p) => p.course).filter((t) => t !== "—" && t !== NO_ROUTE))];
  const taken = new Set(assigned.map((t) => t.toLowerCase()));
  const optional = recommended.map((c) => c.title).filter((t) => !taken.has(t.toLowerCase()));

  return {
    intro: paragraphs(before),
    people,
    courses: [...assigned.map((t) => info(t, false)), ...[...new Set(optional)].map((t) => info(t, true))],
    closing: paragraphs(after),
  };
}

/** The same memo as plain text for Copy and Download, in the same order as on screen. */
export function memoPlainText(subject: string, layout: MemoLayout): string {
  const blocks: string[] = [`Subject: ${subject}`, ...layout.intro];
  if (layout.people.length > 0) {
    blocks.push(
      layout.people
        .map((p) => `${p.n}. ${p.name} — ${p.role} — ${p.course}${p.paid ? PAID : ""} — ${p.deadline}`)
        .join("\n"),
    );
  }
  if (layout.courses.length > 0) {
    const lines = layout.courses.map(
      (c) =>
        `- ${c.title}${c.minutes ? ` (${c.minutes} mins)` : ""}${c.optional ? " (optional alternative)" : ""}${c.url ? ` – ${c.url}` : ""}`,
    );
    blocks.push(`Course Access:\n${lines.join("\n")}`);
  }
  blocks.push(...layout.closing);
  return blocks.join("\n\n");
}
