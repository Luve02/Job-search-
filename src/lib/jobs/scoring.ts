interface ScoreInput {
  title: string;
  description: string;
  location: string;
}

const roleGroups = [
  ["human resources", "recursos humanos", "talent acquisition", "recruiter", "people operations", "hr coordinator", "hr assistant"],
  ["project coordinator", "program coordinator", "project assistant", "operations coordinator", "coordinador de proyecto"],
  ["psychology", "psicología", "psychosocial", "bienestar", "social program", "community"],
];

const skills = [
  "excel", "microsoft office", "planning", "planificación", "logistics", "logística",
  "coordination", "coordinación", "python", "reporting", "seguimiento", "administration",
];

const languages = ["spanish", "español", "english", "inglés", "portuguese", "portugués"];

const targetTitlePattern = /\b(human resources|recursos humanos|talent|recruit|recruiter|people operations|people & culture|hr |hr$|project|program|coordinator|coordinador|psych|psic[oó]log|psychosocial|community|social impact|administrative assistant|office assistant|asistente administrativ|operations assistant)\b/i;
const excessiveSeniorityPattern = /\b(senior|sr\.?|head|director|principal|vice president|vp|chief)\b/i;

export function isTargetTitle(title: string): boolean {
  return targetTitlePattern.test(title) && !excessiveSeniorityPattern.test(title);
}

export function scoreJob(input: ScoreInput): { score: number; reasons: string[] } {
  const title = input.title.toLowerCase();
  const text = `${input.title} ${input.description}`.toLowerCase();
  const location = input.location.toLowerCase();
  const reasons: string[] = [];
  let score = 22;

  if (isTargetTitle(input.title) || roleGroups.some((group) => group.some((term) => title.includes(term)))) {
    score += 35;
    reasons.push("Área profesional compatible");
  } else if (roleGroups.some((group) => group.some((term) => text.includes(term)))) {
    score += 20;
    reasons.push("Funciones relacionadas");
  }

  const skillMatches = skills.filter((skill) => text.includes(skill)).length;
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
