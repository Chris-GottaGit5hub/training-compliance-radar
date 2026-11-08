/*
 * Fictional organization for the 10k synthetic personnel file: 7 sectors, 50 departments,
 * pay grades PG 4-18. Sector codes come from the user; everything else is invented.
 */

export const SECTORS = ["BBS", "CSS", "DBS", "EXEC", "OS", "NDLS", "TIBS"] as const;
export type Sector = (typeof SECTORS)[number];

/** A position and its pay grade; `weight` is its relative headcount within the family. */
export type PositionSpec = { title: string; pg: number; weight: number };

/** Staff positions by department type. Managers (PG 15-18) are added separately. */
export const FAMILIES: Record<string, PositionSpec[]> = {
  branch: [
    { title: "Customer Associate", pg: 4, weight: 30 },
    { title: "Teller", pg: 5, weight: 20 },
    { title: "Senior Customer Associate", pg: 6, weight: 12 },
    { title: "Cash Custodian", pg: 7, weight: 6 },
    { title: "Loan Processor", pg: 7, weight: 8 },
    { title: "Credit Investigator", pg: 9, weight: 5 },
    { title: "Account Officer", pg: 10, weight: 8 },
    { title: "Branch Operations Supervisor", pg: 13, weight: 4 },
    { title: "Branch Manager", pg: 14, weight: 3 },
  ],
  lending: [
    { title: "Customer Associate", pg: 4, weight: 8 },
    { title: "Loan Processor", pg: 7, weight: 15 },
    { title: "Credit Investigator", pg: 9, weight: 15 },
    { title: "Account Officer", pg: 10, weight: 20 },
    { title: "Credit Analyst", pg: 11, weight: 18 },
    { title: "Senior Credit Analyst", pg: 12, weight: 10 },
    { title: "Lending Specialist", pg: 13, weight: 6 },
    { title: "Lending Unit Head", pg: 14, weight: 3 },
  ],
  finance: [
    { title: "Administrative Assistant", pg: 5, weight: 8 },
    { title: "Bookkeeper", pg: 6, weight: 12 },
    { title: "Accounting Assistant", pg: 8, weight: 15 },
    { title: "Budget Analyst", pg: 11, weight: 15 },
    { title: "Accountant", pg: 12, weight: 20 },
    { title: "Senior Accountant", pg: 13, weight: 8 },
    { title: "Finance Unit Head", pg: 14, weight: 3 },
  ],
  tech: [
    { title: "IT Support Associate", pg: 8, weight: 20 },
    { title: "Systems Developer", pg: 11, weight: 25 },
    { title: "Network Engineer", pg: 11, weight: 10 },
    { title: "Senior Systems Developer", pg: 12, weight: 15 },
    { title: "IT Security Specialist", pg: 13, weight: 8 },
    { title: "Systems Architect", pg: 14, weight: 4 },
  ],
  treasury: [
    { title: "Treasury Assistant", pg: 7, weight: 15 },
    { title: "Settlement Associate", pg: 8, weight: 12 },
    { title: "Investment Analyst", pg: 11, weight: 18 },
    { title: "Dealer", pg: 11, weight: 12 },
    { title: "Senior Dealer", pg: 13, weight: 6 },
    { title: "Portfolio Manager", pg: 14, weight: 4 },
  ],
  corporate: [
    { title: "Administrative Assistant", pg: 5, weight: 18 },
    { title: "Records Clerk", pg: 5, weight: 10 },
    { title: "HR Assistant", pg: 9, weight: 10 },
    { title: "Procurement Officer", pg: 10, weight: 10 },
    { title: "HR Officer", pg: 11, weight: 12 },
    { title: "Training Specialist", pg: 11, weight: 8 },
    { title: "Communications Officer", pg: 11, weight: 6 },
    { title: "Attorney", pg: 14, weight: 4 },
    { title: "Services Unit Head", pg: 14, weight: 3 },
  ],
  control: [
    { title: "Administrative Assistant", pg: 5, weight: 10 },
    { title: "Audit Associate", pg: 9, weight: 15 },
    { title: "Executive Assistant", pg: 10, weight: 6 },
    { title: "Risk Analyst", pg: 11, weight: 15 },
    { title: "Auditor", pg: 12, weight: 15 },
    { title: "Compliance Officer", pg: 12, weight: 12 },
    { title: "Senior Auditor", pg: 13, weight: 8 },
    { title: "Control Unit Head", pg: 14, weight: 3 },
  ],
  operations: [
    { title: "Customer Associate", pg: 4, weight: 15 },
    { title: "Operations Clerk", pg: 5, weight: 20 },
    { title: "Operations Associate", pg: 6, weight: 20 },
    { title: "Payments Processor", pg: 7, weight: 12 },
    { title: "Operations Analyst", pg: 11, weight: 10 },
    { title: "Operations Specialist", pg: 13, weight: 5 },
    { title: "Operations Unit Head", pg: 14, weight: 3 },
  ],
};

export const MANAGER_TITLES = {
  assistantManager: { title: "Assistant Department Manager", pg: 15 },
  departmentManager: { title: "Department Manager", pg: 16 },
  groupHead: { title: "Group Head", pg: 17 },
  sectorHead: { title: "Sector Head", pg: 18 },
} as const;

export interface DepartmentSpec {
  name: string;
  sector: Sector;
  group: string;
  family: keyof typeof FAMILIES;
  /** Relative headcount. */
  weight: number;
  /** >1 = more untrained staff at the Sep 30 checkpoint. */
  risk: number;
  /** Office location written in the region column. */
  region: string;
}

const HO = "NCR - Head Office";
const d = (
  name: string,
  sector: Sector,
  group: string,
  family: keyof typeof FAMILIES,
  weight: number,
  risk: number,
  region: string = HO,
): DepartmentSpec => ({ name, sector, group, family, weight, risk, region });

/** 50 departments. Weights add up to about 10,000; the builder scales them to exactly the target. */
export const DEPARTMENTS: DepartmentSpec[] = [
  // BBS: 12 departments
  d("NCR North Branches", "BBS", "Luzon Branches Group", "branch", 420, 1.3, "NCR"),
  d("NCR South Branches", "BBS", "Luzon Branches Group", "branch", 410, 1.2, "NCR"),
  d("Northern Luzon Branches", "BBS", "Luzon Branches Group", "branch", 380, 1.4, "Region I"),
  d("Central Luzon Branches", "BBS", "Luzon Branches Group", "branch", 400, 1.3, "Region III"),
  d("Southern Luzon Branches", "BBS", "Luzon Branches Group", "branch", 390, 1.2, "Region IV-A"),
  d("Bicol Branches", "BBS", "Luzon Branches Group", "branch", 330, 1.5, "Region V"),
  d("Western Visayas Branches", "BBS", "Visayas-Mindanao Branches Group", "branch", 360, 1.3, "Region VI"),
  d("Central Visayas Branches", "BBS", "Visayas-Mindanao Branches Group", "branch", 380, 1.1, "Region VII"),
  d("Eastern Visayas Branches", "BBS", "Visayas-Mindanao Branches Group", "branch", 300, 1.6, "Region VIII"),
  d("Northern Mindanao Branches", "BBS", "Visayas-Mindanao Branches Group", "branch", 340, 1.4, "Region X"),
  d("Southern Mindanao Branches", "BBS", "Visayas-Mindanao Branches Group", "branch", 360, 1.3, "Region XI"),
  d("Branch Support Services", "BBS", "Visayas-Mindanao Branches Group", "operations", 130, 1.0),
  // DBS: 7 departments
  d("Agriculture Lending", "DBS", "Agri and Rural Lending Group", "lending", 170, 1.0),
  d("Cooperatives Lending", "DBS", "Agri and Rural Lending Group", "lending", 140, 1.1),
  d("Development Assistance", "DBS", "Agri and Rural Lending Group", "lending", 120, 0.9),
  d("MSME Lending", "DBS", "Enterprise Development Group", "lending", 160, 1.0),
  d("Infrastructure Lending", "DBS", "Enterprise Development Group", "lending", 130, 0.8),
  d("Social Services Lending", "DBS", "Enterprise Development Group", "lending", 110, 1.0),
  d("Program Management", "DBS", "Enterprise Development Group", "corporate", 100, 0.9),
  // NDLS: 6 departments
  d("Large Enterprise Lending", "NDLS", "Corporate Lending Group", "lending", 150, 0.8),
  d("Public Sector Lending", "NDLS", "Corporate Lending Group", "lending", 140, 0.9),
  d("Credit Management", "NDLS", "Corporate Lending Group", "lending", 140, 1.0),
  d("Loan Remedial Management", "NDLS", "Credit Support Group", "lending", 120, 1.2),
  d("Credit Policy", "NDLS", "Credit Support Group", "control", 90, 0.7),
  d("Lending Program Support", "NDLS", "Credit Support Group", "operations", 130, 1.1),
  // TIBS: 5 departments
  d("Treasury Operations", "TIBS", "Treasury Group", "treasury", 130, 0.8),
  d("Investment Banking", "TIBS", "Treasury Group", "treasury", 110, 0.7),
  d("Trust Banking", "TIBS", "Trust and Asset Management Group", "treasury", 110, 0.9),
  d("Asset Management", "TIBS", "Trust and Asset Management Group", "treasury", 100, 0.8),
  d("Treasury Risk Desk", "TIBS", "Trust and Asset Management Group", "control", 90, 0.7),
  // OS: 8 departments
  d("Payments Operations", "OS", "Banking Operations Group", "operations", 210, 1.2),
  d("Loans Operations", "OS", "Banking Operations Group", "operations", 190, 1.1),
  d("Deposit Operations", "OS", "Banking Operations Group", "operations", 200, 1.3),
  d("Contact Center", "OS", "Banking Operations Group", "operations", 180, 1.5),
  d("Information Technology Services", "OS", "Technology Group", "tech", 180, 1.0),
  d("Systems Development", "OS", "Technology Group", "tech", 170, 0.9),
  d("IT Infrastructure", "OS", "Technology Group", "tech", 160, 1.1),
  d("Information Security", "OS", "Technology Group", "tech", 110, 0.6),
  // CSS: 8 departments
  d("Human Resources", "CSS", "People and Services Group", "corporate", 150, 0.6),
  d("Learning and Development", "CSS", "People and Services Group", "corporate", 90, 0.5),
  d("General Services", "CSS", "People and Services Group", "corporate", 220, 1.5),
  d("Procurement", "CSS", "People and Services Group", "corporate", 140, 1.3),
  d("Accounting", "CSS", "Finance and Legal Group", "finance", 180, 0.8),
  d("Budget and Controllership", "CSS", "Finance and Legal Group", "finance", 130, 0.8),
  d("Legal Services", "CSS", "Finance and Legal Group", "corporate", 110, 0.7),
  d("Corporate Communications", "CSS", "Finance and Legal Group", "corporate", 100, 1.2),
  // EXEC: 4 departments
  d("Office of the President", "EXEC", "Executive Office Group", "control", 90, 0.9),
  d("Internal Audit", "EXEC", "Executive Office Group", "control", 160, 0.8),
  d("Compliance Management", "EXEC", "Governance Group", "control", 140, 0.7),
  d("Risk Management", "EXEC", "Governance Group", "control", 150, 0.9),
];

/** Fictional name parts: random combinations only, no real individuals. */
export const FEMALE_FIRST = [
  "Maria", "Ana", "Jennifer", "Angelica", "Kristine", "Elena", "Katrina", "Liza", "Carmela",
  "Rosario", "Camille", "Michelle", "Patricia", "Sheila", "Joanna", "Beatriz", "Grace", "Lorna",
  "Cristina", "Maricel", "Aileen", "Bernadette", "Charmaine", "Diana", "Erlinda", "Frances",
  "Gemma", "Hazel", "Irene", "Jasmine", "Karen", "Leah", "Mylene", "Nina", "Olivia", "Pia",
  "Regina", "Sarah", "Teresa", "Vilma",
] as const;

export const MALE_FIRST = [
  "Jose", "Juan", "Mark", "John Paul", "Christian", "Ramon", "Carlo", "Miguel", "Paolo", "Joel",
  "Ariel", "Dennis", "Noel", "Rey", "Victor", "Arnold", "Edgar", "Jerome", "Nathaniel", "Leo",
  "Alfredo", "Benjie", "Cesar", "Danilo", "Emmanuel", "Francis", "Gilbert", "Herbert", "Ian",
  "Jayson", "Kevin", "Lorenzo", "Manuel", "Nestor", "Oscar", "Rodel", "Samuel", "Tristan",
  "Vincent", "Wilfredo",
] as const;

export const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Villanueva",
  "Ramos", "Aquino", "Castillo", "De Leon", "Dela Cruz", "Navarro", "Pascual", "Manalo", "Soriano",
  "Domingo", "Tolentino", "Salazar", "Aguilar", "Fernandez", "Lopez", "Gonzales", "Flores",
  "Rivera", "Mercado", "Dizon", "Valdez", "Hernandez", "Magno", "Santiago", "Lacson", "Evangelista",
  "Macaraeg", "Padilla", "Del Rosario", "Concepcion", "Panganiban", "Abad", "Bernardo", "Cabrera",
  "Dimaculangan", "Espiritu", "Fajardo", "Galang", "Ilagan", "Javier", "Lim", "Marquez", "Natividad",
  "Ortega", "Perez", "Quiambao", "Rosales", "Sison", "Tan", "Umali", "Vergara",
] as const;

/** Reserved test domain (RFC 2606): mail to it can never reach a real inbox. */
export const EMAIL_DOMAIN = "agency.example";
