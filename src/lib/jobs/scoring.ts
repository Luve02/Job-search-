interface ScoreInput {
  title: string;
  description: string;
  location: string;
  targetRoles?: string[];
  profileSkills?: string[];
}

const roleGroups = [
  ["human resources", "recursos humanos", "talent acquisition", "talento humano", "recruiter", "reclutamiento", "selección", "people operations", "people & culture", "hr coordinator", "hr assistant", "hr generalist", "generalista", "relaciones laborales", "desarrollo organizacional"],
  ["project coordinator", "program coordinator", "project assistant", "operations coordinator", "coordinador de proyecto", "coordinación de proyectos", "coordinador de programa", "gestor de proyectos", "project management"],
  ["psychology", "psicología", "psychosocial", "psicosocial", "bienestar", "wellbeing", "social program", "impacto social", "orientador", "counselor"],
  ["administrative assistant", "asistente administrativo", "office assistant", "operations assistant", "asistente de operaciones", "coordinador administrativo"],
];

const skills = [
  "excel", "microsoft office", "planning", "planificación", "logistics", "logística",
  "coordination", "coordinación", "python", "reporting", "seguimiento", "administration",
];

const languages = ["spanish", "español", "english", "inglés", "portuguese", "portugués"];

const targetTitlePattern = /\b(human resources|recursos humanos|talent|talento humano|recruit|recruiter|reclut|selecci[oó]n|people operations|people & culture|hr |hr$|generalista|relaciones laborales|desarrollo organizacional|project|proyecto|program|programa|coordinator|coordinador|coordinaci[oó]n|gestor de proyectos|psych|psic[oó]log|psychosocial|psicosocial|bienestar|wellbeing|orientador|counselor|social impact|impacto social|administrative assistant|office assistant|asistente administrativ|operations assistant|asistente de operaciones)\b/i;
const excessiveSeniorityPattern = /\b(senior|sr\.?|head|director|principal|vice president|vp|chief)\b/i;

export function isTargetTitle(title: string, targetRoles: string[] = []): boolean {
  const normalizedTitle = title.toLowerCase();
  const customMatch = targetRoles.some((role) => roleKeywords(role).some((keyword) => normalizedTitle.includes(keyword)));
  return (targetTitlePattern.test(title) || customMatch) && !excessiveSeniorityPattern.test(title);
}

export function scoreJob(input: ScoreInput): { score: number; reasons: string[] } {
  const title = input.title.toLowerCase();
  const text = `${input.title} ${input.description}`.toLowerCase();
  const location = input.location.toLowerCase();
  const reasons: string[] = [];
  let score = 22;

  const preferredRoleMatch = (input.targetRoles ?? []).some((role) => roleKeywords(role).some((keyword) => title.includes(keyword)));
  if (preferredRoleMatch || isTargetTitle(input.title, input.targetRoles) || roleGroups.some((group) => group.some((term) => title.includes(term)))) {
    score += 35;
    reasons.push("Área profesional compatible");
  } else if (roleGroups.some((group) => group.some((term) => text.includes(term)))) {
    score += 20;
    reasons.push("Funciones relacionadas");
  }

  const configuredSkills = [...skills, ...(input.profileSkills ?? []).map((skill) => skill.toLowerCase())];
  const skillMatches = [...new Set(configuredSkills)].filter((skill) => text.includes(skill)).length;
  if (skillMatches > 0) {
    score += Math.min(20, skillMatches * 5);
    reasons.push(`${skillMatches} habilidad${skillMatches === 1 ? "" : "es"} compatible${skillMatches === 1 ? "" : "s"}`);
  }

  if (/costa rica|latam|latin america|worldwide|anywhere|americas/.test(location)) {
    score += 13;
    reasons.push("Ubicación compatible con CR");
  }

  if (/junior|entry.level|assistant|asistente|coordinator|coordinador/.test(text)) {
    score += 7;
    reasons.push("Nivel de experiencia razonable");
  }

  if (languages.some((language) => text.includes(language))) {
    score += 5;
    reasons.push("Idiomas aprovechables");
  }

  if (reasons.length === 0) reasons.push("Requiere revisión manual");
  return { score: Math.min(100, score), reasons: reasons.slice(0, 3) };
}

function roleKeywords(role: string): string[] {
  const normalized = role.toLowerCase();
  const mapped = roleGroups.find((group) => group.some((term) => normalized.includes(term) || term.includes(normalized)));
  if (mapped) return mapped;
  return normalized
    .split(/[,/&]|\s+y\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}
