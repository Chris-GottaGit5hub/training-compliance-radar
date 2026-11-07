import type { CatalogRow } from "../../lib/schemas/rows";

type Course = [title: string, skillArea: string, minutes: number];

const LINKEDIN: Course[] = [
  ["Data Privacy and Security Fundamentals", "Compliance", 55],
  ["Communicating with Confidence", "Communication", 62],
  ["Leadership Foundations", "Leadership", 78],
  ["Excel Essential Training", "Productivity", 140],
  ["Project Management Foundations", "Project Management", 120],
  ["Customer Service Foundations", "Customer Service", 65],
  ["Cybersecurity Awareness", "IT Security", 48],
  ["Introduction to Data Analytics", "Data & Analytics", 95],
  ["Financial Literacy for Professionals", "Finance", 85],
  ["Time Management: Working From Home", "Productivity", 38],
  ["Business Writing Principles", "Communication", 72],
  ["Managing Stress for Positive Change", "Wellness", 52],
  ["Strategic Thinking", "Leadership", 110],
  ["Anti-Money Laundering Foundations", "Compliance", 90],
  ["Power BI Essential Training", "Data & Analytics", 160],
  ["Giving and Receiving Feedback", "Communication", 42],
];

const IN_HOUSE: [...Course, cost: number][] = [
  ["Code of Conduct and Ethics Workshop", "Compliance", 240, 450],
  ["Records Management and Documentation", "Productivity", 180, 600],
  ["Supervisory Skills Seminar", "Leadership", 480, 2400],
  ["Customer Handling in Banking Operations", "Customer Service", 240, 900],
  ["Risk and Control Self-Assessment", "Compliance", 300, 1200],
  ["Procurement Law Refresher", "Compliance", 360, 1500],
  ["Effective Report Writing", "Communication", 240, 750],
  ["Occupational Safety and Health Orientation", "Wellness", 180, 350],
  ["Introduction to Government Accounting", "Finance", 420, 1800],
  ["Information Security Hands-on Lab", "IT Security", 300, 2100],
];

const pad = (n: number) => String(n).padStart(3, "0");

export function buildCatalog(): CatalogRow[] {
  const linkedin = LINKEDIN.map(([title, skill_area, duration_minutes], i) => ({
    course_id: `LL-${pad(i + 1)}`,
    title,
    skill_area,
    duration_minutes,
    provider: "linkedin_learning" as const,
    url: `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(title)}`,
    cost_per_head: 0,
  }));
  const inHouse = IN_HOUSE.map(([title, skill_area, duration_minutes, cost_per_head], i) => ({
    course_id: `IH-${pad(i + 1)}`,
    title,
    skill_area,
    duration_minutes,
    provider: "in_house" as const,
    url: undefined,
    cost_per_head,
  }));
  return [...linkedin, ...inHouse];
}
