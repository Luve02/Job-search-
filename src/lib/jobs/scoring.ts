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

const targetDomainPattern = /\b(human resources|recursos humanos|talent acquisition|talento humano|recruit|reclut|selecci[oó]n|people operations|people & culture|employee experience|hr |hr$|generalista|relaciones laborales|desarrollo organizacional|project|proyecto|program|programa|operations|operaciones|psych|psic[oó]log|psychosocial|psicosocial|bienestar|wellbeing|social program|programa social|social impact|impacto social|administration|administraci[oó]n)\b/i;
const roleAnchorPattern = /\b(assistant|asistente|auxiliar|coordinator|coordinador|analyst|analista|specialist|especialista|recruiter|reclutador|generalist|generalista|psychologist|psic[oó]log[oa]|counselor|orientador|consultant|consultor|officer|manager|gestor|encargado|administrador|administrator|hrbp|human resources|recursos humanos|talent acquisition|people operations|people & culture)\b/i;
const excessiveSeniorityPattern = /\b(senior|sr\.?|head|director|principal|vice president|vp|chief)\b/i;

export function isTargetTitle(title: string, targetRoles: string[] = []): boolean {
  const normalizedTitle = title.toLowerCase();
  const hasRoleAnchor = roleAnchorPattern.test(title);
  const customMatch = hasRoleAnchor && targetRoles.some((role) => roleKeywords(role).some((keyword) => normalizedTitle.includes(keyword)));
  const standardMatch = hasRoleAnchor && targetDomainPattern.test(title);
  return (standardMatch || customMatch) && !excessiveSeniorityPattern.test(title);
}

export function scoreJob(input: ScoreInput): { score: number; reasons: string[] } {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const location = input.location.toLowerCase();
  const reasons: string[] = [];
  let score = 22;

  if (isTargetTitle(input.title, input.targetRoles)) {
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
