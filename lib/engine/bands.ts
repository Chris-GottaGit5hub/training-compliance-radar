export const BANDS = ["Rank and File", "Officers", "Senior Officers", "Unbanded"] as const;

export type Band = (typeof BANDS)[number];

/** Spec §2.1: PG 4-9 Rank and File, PG 10-13 Officers, PG 14-18 Senior Officers; anything else Unbanded. */
export function payGradeBand(grade: number | undefined): Band {
  if (grade === undefined) return "Unbanded";
  if (grade >= 4 && grade <= 9) return "Rank and File";
  if (grade >= 10 && grade <= 13) return "Officers";
  if (grade >= 14 && grade <= 18) return "Senior Officers";
  return "Unbanded";
}
