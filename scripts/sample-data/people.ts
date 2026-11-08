/** Fictional name parts: random combinations only, no real individuals. */
export const FIRST_NAMES = [
  "Maria", "Jose", "Juan", "Ana", "Mark", "John Paul", "Jennifer", "Angelica",
  "Christian", "Kristine", "Ramon", "Elena", "Carlo", "Katrina", "Miguel", "Liza",
  "Paolo", "Carmela", "Joel", "Rosario", "Ariel", "Camille", "Dennis", "Michelle",
  "Noel", "Patricia", "Rey", "Sheila", "Victor", "Joanna", "Arnold", "Beatriz",
  "Edgar", "Grace", "Jerome", "Lorna", "Nathaniel", "Cristina", "Leo", "Maricel",
] as const;

export const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres",
  "Villanueva", "Ramos", "Aquino", "Castillo", "De Leon", "Dela Cruz", "Navarro",
  "Pascual", "Manalo", "Soriano", "Domingo", "Tolentino", "Salazar", "Aguilar",
  "Fernandez", "Lopez", "Gonzales", "Flores", "Rivera", "Mercado", "Dizon", "Valdez",
  "Hernandez", "Magno", "Santiago", "Lacson", "Evangelista", "Macaraeg", "Padilla",
  "Del Rosario", "Concepcion", "Panganiban",
] as const;

/** unit -> [headcount weight, risk factor (>1 = more untrained), positions] */
export const UNITS: Record<string, { weight: number; risk: number; positions: string[] }> = {
  "Human Resources": { weight: 20, risk: 0.6, positions: ["HR Officer", "Training Specialist", "Payroll Analyst", "Recruitment Officer"] },
  "Finance": { weight: 30, risk: 0.8, positions: ["Accountant", "Budget Analyst", "Treasury Officer", "Finance Clerk"] },
  "Information Technology": { weight: 30, risk: 1.0, positions: ["Systems Analyst", "Network Engineer", "Developer", "Help Desk Associate"] },
  "Legal Services": { weight: 12, risk: 0.7, positions: ["Attorney", "Legal Assistant", "Paralegal"] },
  "Branch Operations": { weight: 55, risk: 1.4, positions: ["Teller", "Branch Associate", "Customer Service Representative", "Operations Officer"] },
  "Credit Management": { weight: 30, risk: 1.1, positions: ["Credit Analyst", "Loan Officer", "Account Officer"] },
  "Risk Management": { weight: 15, risk: 0.9, positions: ["Risk Analyst", "Compliance Officer", "Risk Associate"] },
  "Internal Audit": { weight: 14, risk: 0.8, positions: ["Auditor", "Audit Associate", "Audit Analyst"] },
  "Corporate Planning": { weight: 12, risk: 1.0, positions: ["Planning Officer", "Research Analyst", "Planning Associate"] },
  "Procurement": { weight: 18, risk: 1.3, positions: ["Procurement Officer", "Supply Clerk", "Bids and Awards Staff"] },
  "Administrative Services": { weight: 40, risk: 1.5, positions: ["Administrative Aide", "Driver", "Records Officer", "Utility Worker"] },
  "Corporate Communications": { weight: 24, risk: 1.2, positions: ["Communications Officer", "Content Writer", "Graphic Artist"] },
};

/** unit -> [group, sector]: 12 departments, 9 groups, 7 sectors (fictional). */
export const UNIT_ORG: Record<string, readonly [group: string, sector: string]> = {
  "Branch Operations": ["Branches Group", "Branch Banking Sector"],
  "Credit Management": ["Lending Group", "Lending Sector"],
  "Risk Management": ["Risk and Control Group", "Lending Sector"],
  "Administrative Services": ["Operations Group", "Operations Sector"],
  "Procurement": ["Operations Group", "Operations Sector"],
  "Information Technology": ["Technology Group", "Technology Sector"],
  "Finance": ["Finance Group", "Finance and Legal Sector"],
  "Legal Services": ["Legal Group", "Finance and Legal Sector"],
  "Human Resources": ["People Group", "People and Corporate Sector"],
  "Corporate Communications": ["Communications Group", "People and Corporate Sector"],
  "Corporate Planning": ["Planning Group", "People and Corporate Sector"],
  "Internal Audit": ["Governance Group", "Governance Sector"],
};

export const TRAINING_TITLES = [
  "Data Privacy Act Awareness", "Customer Service Excellence", "Records Management Seminar",
  "Basic Occupational Safety and Health", "Leadership and Supervision Workshop",
  "Government Procurement Updates", "Effective Business Writing", "Anti-Money Laundering Briefing",
  "Excel for Office Work", "Information Security Awareness", "Ethics and Public Accountability",
  "Project Management Essentials", "Financial Reporting Standards Update", "Stress Management and Wellness",
  "Process Improvement Basics", "Internal Controls Orientation", "Communication Skills Workshop",
  "Strategic Planning Forum",
] as const;
