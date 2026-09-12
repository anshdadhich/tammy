/**
 * Canonical skill list + alias map for dropdown / normalization.
 * Mirrors docs/04: free entry → normalized to canonical
 * (JS→JavaScript, ReactJS→React, Postgres→PostgreSQL, ML→Machine Learning).
 */

export const CANONICAL_SKILLS = [
  // Languages
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "Go",
  "Rust",
  "C++",
  "C#",
  "PHP",
  "Ruby",
  "SQL",
  // Frontend
  "React",
  "Next.js",
  "Vue.js",
  "Angular",
  "HTML",
  "CSS",
  "Tailwind CSS",
  // Backend
  "Node.js",
  "Express",
  "NestJS",
  "Django",
  "Flask",
  "FastAPI",
  "Spring Boot",
  // Data / AI
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Elasticsearch",
  "Machine Learning",
  "Deep Learning",
  "NLP",
  "Data Analysis",
  "Pandas",
  "TensorFlow",
  "PyTorch",
  // Infra / DevOps
  "Docker",
  "Kubernetes",
  "AWS",
  "GCP",
  "Azure",
  "CI/CD",
  "Terraform",
  "Linux",
  // Mobile
  "React Native",
  "Flutter",
  "Swift",
  "Kotlin",
  // Practices / APIs
  "REST APIs",
  "GraphQL",
  "System Design",
  "Microservices",
  // Non-tech (docs/04: adapt per domain)
  "UI Design",
  "Figma",
  "SEO",
  "Content Marketing",
  "Sales",
  "Excel",
] as const;

export type CanonicalSkill = (typeof CANONICAL_SKILLS)[number];

/** lowercase input → canonical. Covers docs/04 examples + common variants. */
export const SKILL_ALIASES: Record<string, CanonicalSkill> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  reactjs: "React",
  react: "React",
  "react.js": "React",
  nextjs: "Next.js",
  "next.js": "Next.js",
  next: "Next.js",
  vue: "Vue.js",
  "vue.js": "Vue.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  node: "Node.js",
  expressjs: "Express",
  express: "Express",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  psql: "PostgreSQL",
  mysql: "MySQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  elastic: "Elasticsearch",
  elasticsearch: "Elasticsearch",
  ml: "Machine Learning",
  "machine learning": "Machine Learning",
  dl: "Deep Learning",
  "deep learning": "Deep Learning",
  nlp: "NLP",
  py: "Python",
  python: "Python",
  golang: "Go",
  go: "Go",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  dockers: "Docker",
  docker: "Docker",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  "react native": "React Native",
  reactnative: "React Native",
  tailwind: "Tailwind CSS",
  "tailwind css": "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  rest: "REST APIs",
  "rest api": "REST APIs",
  "rest apis": "REST APIs",
  restapi: "REST APIs",
  graphql: "GraphQL",
  figma: "Figma",
  seo: "SEO",
};

/** Normalize a free-text skill to canonical where possible. */
export function normalizeSkill(input: string): string {
  const key = input.trim().toLowerCase();
  if (!key) return input;
  return SKILL_ALIASES[key] ?? input.trim();
}

/** Dedupe (case-insensitive) + normalize a skill list. */
export function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const n = normalizeSkill(s);
    const k = n.toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

export const DOMAINS = [
  "Software Development",
  "Data / AI",
  "Design",
  "Marketing",
  "Sales",
  "Product",
  "Operations",
  "Finance",
  "HR",
  "Other",
] as const;

export const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
] as const;

export const REMOTE_PREFS = ["onsite", "hybrid", "remote"] as const;

export const SALARY_FREQUENCIES = ["hourly", "monthly", "yearly"] as const;

export const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "freelance",
] as const;
