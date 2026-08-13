"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_SEARCH_PREFERENCES,
  type DiscoveryResponse,
  type Freshness,
  type JobDecision,
  type JobOpportunity,
} from "@/lib/jobs/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type View = "opportunities" | "applications" | "profile" | "filters";
type Filter = "recommended" | "possible" | Freshness | "accepted" | "saved";
type SyncState = "idle" | "saving" | "saved" | "error";
type ApplicationStatus = "preparing" | "applied" | "interview" | "offer" | "rejected" | "withdrawn";

interface ProfileSettings {
  fullName: string;
  location: string;
  targetRoles: string[];
  skills: string[];
  minimumScore: number;
  preferredMaxAgeDays: number;
  fallbackMaxAgeDays: number;
}

interface ProfileDraft {
  fullName: string;
  location: string;
  targetRolesText: string;
  skillsText: string;
  minimumScore: number;
}

interface SavedJobRecord {
  id: string;
  url: string;
  source: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  posted_at: string | null;
  score: number;
  reasons: string[];
  decision: Exclude<JobDecision, "new">;
  decided_at: string;
}

interface ApplicationRecord {
  id: string;
  saved_job_id: string;
  status: ApplicationStatus;
  applied_at: string | null;
  notes: string;
  updated_at: string;
}

interface SourceSettings {
  brave: boolean;
  remotive: boolean;
}

const DEFAULT_PROFILE: ProfileSettings = {
  fullName: "Luis Roberto Vega",
  location: "Heredia, Costa Rica",
  targetRoles: DEFAULT_SEARCH_PREFERENCES.targetRoles,
  skills: DEFAULT_SEARCH_PREFERENCES.skills,
  minimumScore: DEFAULT_SEARCH_PREFERENCES.minimumScore,
  preferredMaxAgeDays: 30,
  fallbackMaxAgeDays: 60,
};

const FILTER_LABELS: Record<Filter, string> = {
  recommended: "Recomendadas",
  possible: "Posibles",
  fresh: "0–30 días",
  older: "31–60 días",
  unknown: "Fecha por confirmar",
  stale: "Más de 60 días",
  accepted: "Aceptadas",
  saved: "Guardadas",
};

const NAV_ITEMS: Array<{ id: View; icon: string; label: string }> = [
  { id: "opportunities", icon: "⌕", label: "Oportunidades" },
  { id: "applications", icon: "✓", label: "Mis postulaciones" },
  { id: "profile", icon: "◈", label: "Mi perfil" },
  { id: "filters", icon: "⚙", label: "Fuentes y filtros" },
];

export function JobDashboard() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [view, setView] = useState<View>("opportunities");
  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJobRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [cloudDecisions, setCloudDecisions] = useState<Record<string, JobDecision>>({});
  const [profile, setProfile] = useState<ProfileSettings>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(toDraft(DEFAULT_PROFILE));
  const [sources, setSources] = useState<SourceSettings>({ brave: true, remotive: true });
  const [notices, setNotices] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("recommended");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const [queryCount, setQueryCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session?.user) {
        setSavedJobs([]);
        setApplications([]);
        setCloudDecisions({});
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSources(readSourceSettings()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!supabase || !user) return;

    const [profileResult, jobsResult, applicationsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, location, target_roles, skills, minimum_score, preferred_max_age_days, fallback_max_age_days")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("saved_jobs")
        .select("id, url, source, title, company, location, remote, posted_at, score, reasons, decision, decided_at")
        .eq("user_id", user.id)
        .order("decided_at", { ascending: false }),
      supabase
        .from("applications")
        .select("id, saved_job_id, status, applied_at, notes, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
    ]);

    if (profileResult.error || jobsResult.error || applicationsResult.error) {
      setSyncState("error");
      return;
    }

    if (profileResult.data) {
      const nextProfile: ProfileSettings = {
        fullName: profileResult.data.full_name || DEFAULT_PROFILE.fullName,
        location: profileResult.data.location || DEFAULT_PROFILE.location,
        targetRoles: profileResult.data.target_roles?.length ? profileResult.data.target_roles : DEFAULT_PROFILE.targetRoles,
        skills: profileResult.data.skills?.length ? profileResult.data.skills : DEFAULT_PROFILE.skills,
        minimumScore: profileResult.data.minimum_score ?? DEFAULT_PROFILE.minimumScore,
        preferredMaxAgeDays: profileResult.data.preferred_max_age_days ?? 30,
        fallbackMaxAgeDays: profileResult.data.fallback_max_age_days ?? 60,
      };
      setProfile(nextProfile);
      setProfileDraft(toDraft(nextProfile));
    }

    const nextSavedJobs = (jobsResult.data ?? []) as SavedJobRecord[];
    const nextApplications = (applicationsResult.data ?? []) as ApplicationRecord[];
    const decisions = Object.fromEntries(nextSavedJobs.map((job) => [job.url, job.decision]));
    setSavedJobs(nextSavedJobs);
    setApplications(nextApplications);
    setCloudDecisions(decisions);
    setJobs((current) => current.map((job) => ({ ...job, decision: decisions[job.url] ?? job.decision })));
    setSyncState("saved");
  }, [supabase, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setSendingLink(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSendingLink(false);
    setAuthMessage(error
      ? `No pudimos enviar el enlace: ${error.message}`
      : "Listo. Revisa tu correo y abre el enlace de acceso en este mismo navegador.");
  }

  async function runSearch() {
    setLoading(true);
    setNotices([]);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            targetRoles: profile.targetRoles,
            skills: profile.skills,
            minimumScore: profile.minimumScore,
            enabledSources: sources,
          },
        }),
      });
      if (!response.ok) throw new Error("search-failed");
      const data = (await response.json()) as DiscoveryResponse;
      const localDecisions = readDecisions();
      const learnedJobs = data.jobs.map((job) => applyLearnedAdjustment(job, savedJobs));
      setJobs(learnedJobs.map((job) => ({
        ...job,
        decision: cloudDecisions[job.url] ?? localDecisions[job.id] ?? "new",
      })));
      setNotices(data.notices);
      setSearchedAt(data.searchedAt);
      setQueryCount(data.queryCount);
      setHasSearched(true);
      setFilter("recommended");
      setView("opportunities");

      if (supabase && user) {
        void supabase.from("search_runs").insert({
          user_id: user.id,
          sources: data.sources,
          result_count: data.jobs.length,
          notices: data.notices,
          searched_at: data.searchedAt,
        });
      }
    } catch {
      setNotices(["No fue posible buscar en este momento. Revisa tu conexión e intenta otra vez."]);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function decide(id: string, decision: JobDecision) {
    const selectedJob = jobs.find((job) => job.id === id);
    if (!selectedJob) return;
    const nextDecision: JobDecision = selectedJob.decision === decision ? "new" : decision;
    const next = jobs.map((job) => job.id === id ? { ...job, decision: nextDecision } : job);
    setJobs(next);
    const decisions = Object.fromEntries(next.filter((job) => job.decision !== "new").map((job) => [job.id, job.decision]));
    localStorage.setItem("jobpilot-decisions", JSON.stringify(decisions));
    if (supabase && user) void persistDecision(selectedJob, nextDecision);
  }

  async function persistDecision(job: JobOpportunity, decision: JobDecision) {
    if (!supabase || !user) return;
    setSyncState("saving");
    const traits = jobTraits(job);

    if (decision === "new") {
      const { error: feedbackError } = await supabase.from("feedback_events").insert({ user_id: user.id, action: "reset", source: job.source, traits });
      const { error: deleteError } = await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("url", job.url);
      if (feedbackError || deleteError) {
        setSyncState("error");
        return;
      }
      await loadWorkspace();
      return;
    }

    const { data: savedJob, error: saveError } = await supabase
      .from("saved_jobs")
      .upsert({
        user_id: user.id,
        url: job.url,
        source: job.source,
        source_job_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        posted_at: job.postedAt,
        score: job.score,
        reasons: job.reasons,
        traits,
        decision,
        decided_at: new Date().toISOString(),
      }, { onConflict: "user_id,url" })
      .select("id")
      .single();

    if (saveError || !savedJob) {
      setSyncState("error");
      return;
    }

    const { error: feedbackError } = await supabase.from("feedback_events").insert({
      user_id: user.id,
      saved_job_id: savedJob.id,
      action: decision,
      source: job.source,
      traits,
    });
    const applicationResult = decision === "accepted"
      ? await supabase.from("applications").upsert({ user_id: user.id, saved_job_id: savedJob.id, status: "preparing" }, { onConflict: "user_id,saved_job_id" })
      : await supabase.from("applications").delete().eq("user_id", user.id).eq("saved_job_id", savedJob.id);

    if (feedbackError || applicationResult.error) {
      setSyncState("error");
      return;
    }
    await loadWorkspace();
  }

  async function recordOpen(job: JobOpportunity) {
    if (!supabase || !user) return;
    await supabase.from("feedback_events").insert({ user_id: user.id, action: "opened", source: job.source, traits: jobTraits(job) });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    setSyncState("saving");
    const nextProfile = fromDraft(profileDraft, profile);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: nextProfile.fullName,
      location: nextProfile.location,
      target_roles: nextProfile.targetRoles,
      skills: nextProfile.skills,
      minimum_score: nextProfile.minimumScore,
      preferred_max_age_days: nextProfile.preferredMaxAgeDays,
      fallback_max_age_days: nextProfile.fallbackMaxAgeDays,
    });
    if (error) {
      setSyncState("error");
      return;
    }
    setProfile(nextProfile);
    setProfileDraft(toDraft(nextProfile));
    setSyncState("saved");
  }

  async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
    if (!supabase || !user) return;
    setSyncState("saving");
    const current = applications.find((application) => application.id === applicationId);
    const { error } = await supabase
      .from("applications")
      .update({ status, applied_at: status !== "preparing" && !current?.applied_at ? new Date().toISOString() : current?.applied_at })
      .eq("id", applicationId)
      .eq("user_id", user.id);
    if (error) {
      setSyncState("error");
      return;
    }
    await loadWorkspace();
  }

  function toggleSource(source: keyof SourceSettings) {
    const next = { ...sources, [source]: !sources[source] };
    if (!next.brave && !next.remotive) return;
    setSources(next);
    localStorage.setItem("jobpilot-sources", JSON.stringify(next));
  }

  if (authLoading) {
    return <div className="auth-page"><div className="auth-card"><span className="auth-logo">J</span><h1>Preparando JobPilot CR…</h1><p>Estamos comprobando tu sesión segura.</p></div></div>;
  }

  if (supabase && !user) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <span className="auth-logo">J</span>
          <p className="eyebrow">Tu espacio privado</p>
          <h1>Entrar a JobPilot CR</h1>
          <p>Te enviaremos un enlace de acceso de un solo uso. No necesitas crear otra contraseña.</p>
          <form className="auth-form" onSubmit={requestMagicLink}>
            <label htmlFor="jobpilot-email">Correo electrónico</label>
            <input id="jobpilot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required />
            <button className="primary-button" disabled={sendingLink}>{sendingLink ? "Enviando…" : "Enviar enlace de acceso"}</button>
          </form>
          {authMessage && <div className="auth-message" role="status">{authMessage}</div>}
        </section>
      </div>
    );
  }

  const possibleFloor = Math.max(40, profile.minimumScore - 15);
  const activeJobs = jobs.filter((job) => job.decision !== "rejected" && job.score >= possibleFloor);
  const visibleJobs = activeJobs.filter((job) => {
    if (filter === "recommended") return job.score >= profile.minimumScore;
    if (filter === "possible") return job.score < profile.minimumScore;
    if (filter === "accepted" || filter === "saved") return job.decision === filter;
    return job.freshness === filter;
  });
  const counts = {
    recommended: activeJobs.filter((job) => job.score >= profile.minimumScore).length,
    possible: activeJobs.filter((job) => job.score < profile.minimumScore).length,
    accepted: savedJobs.filter((job) => job.decision === "accepted").length,
    saved: savedJobs.filter((job) => job.decision === "saved").length,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => setView("opportunities")}><span className="brand-mark">J</span><span className="brand-text">JobPilot CR</span></button>
        <div>
          <p className="sidebar-label">Espacio de trabajo</p>
          <nav className="nav-list" aria-label="Navegación principal">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)} title={item.label}>
                <span className="nav-icon">{item.icon}</span><span className="nav-text">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-note"><strong>Control siempre en tus manos</strong><span>JobPilot prepara; tú revisas y haces el envío final.</span></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span className="topbar-title">{viewTitle(view)}</span>
          <div className="account-area">
            <span className={`sync-chip ${syncState}`}>{syncLabel(syncState, Boolean(supabase))}</span>
            <div className="profile-chip"><span>{profile.fullName || user?.email}</span><div className="avatar">{initials(profile.fullName)}</div></div>
            {user && <button className="sign-out-button" onClick={() => void supabase?.auth.signOut()}>Salir</button>}
          </div>
        </header>

        <div className="content">
          {view === "opportunities" && (
            <OpportunityView jobs={visibleJobs} notices={notices} filter={filter} minimumScore={profile.minimumScore} counts={counts} loading={loading} hasSearched={hasSearched} searchedAt={searchedAt} queryCount={queryCount} onSearch={runSearch} onFilter={setFilter} onDecide={decide} onOpen={recordOpen} />
          )}
          {view === "applications" && <ApplicationsView savedJobs={savedJobs} applications={applications} onStatus={updateApplicationStatus} />}
          {view === "profile" && <ProfileView draft={profileDraft} onChange={setProfileDraft} onSave={saveProfile} />}
          {view === "filters" && <FiltersView draft={profileDraft} sources={sources} onChange={setProfileDraft} onToggleSource={toggleSource} onSave={saveProfile} />}
        </div>
      </main>
    </div>
  );
}

function OpportunityView({ jobs, notices, filter, minimumScore, counts, loading, hasSearched, searchedAt, queryCount, onSearch, onFilter, onDecide, onOpen }: {
  jobs: JobOpportunity[];
  notices: string[];
  filter: Filter;
  minimumScore: number;
  counts: { recommended: number; possible: number; accepted: number; saved: number };
  loading: boolean;
  hasSearched: boolean;
  searchedAt: string | null;
  queryCount: number;
  onSearch: () => void;
  onFilter: (filter: Filter) => void;
  onDecide: (id: string, decision: JobDecision) => void;
  onOpen: (job: JobOpportunity) => void;
}) {
  return (
    <>
      <section className="hero-row">
        <div><p className="eyebrow">Radar de oportunidades</p><h1>Vacantes que sí vale la pena revisar</h1><p className="hero-copy">Buscamos publicaciones de hasta 60 días para Costa Rica o remoto LATAM. Las coincidencias menores aparecen aparte para no perder oportunidades reales.</p></div>
        <button className="primary-button" onClick={onSearch} disabled={loading}>{loading ? "Buscando en varias fuentes…" : "⌕  Buscar oportunidades"}</button>
      </section>

      <section className="stats" aria-label="Resumen">
        <Stat label={`Recomendadas ≥${minimumScore}%`} value={counts.recommended} color="#176b4d" />
        <Stat label="Posibles" value={counts.possible} color="#776b8b" />
        <Stat label="Aceptadas" value={counts.accepted} color="#2e608f" />
        <Stat label="Guardadas" value={counts.saved} color="#bd791b" />
      </section>

      <div className="notice"><span>●</span><span><strong>Búsqueda ampliada:</strong> hasta siete consultas especializadas; 0–30 días tienen prioridad, 31–60 aparecen aparte y más de 60 se descartan.</span></div>
      {notices.map((notice) => <div className="notice warning" key={notice}><span>!</span><span>{notice}</span></div>)}

      <section className="toolbar">
        <div className="tabs">
          {(Object.keys(FILTER_LABELS) as Filter[]).filter((key) => key !== "stale").map((key) => <button key={key} className={`tab ${filter === key ? "active" : ""}`} onClick={() => onFilter(key)}>{FILTER_LABELS[key]}</button>)}
        </div>
        <span className="results-meta">{searchedAt ? `${jobs.length} en esta sección · ${queryCount} consultas · ${formatTime(searchedAt)}` : "Aún sin buscar"}</span>
      </section>

      <section className="job-list">
        {jobs.map((job) => <JobCard key={job.id} job={job} minimumScore={minimumScore} onDecide={onDecide} onOpen={onOpen} />)}
        {jobs.length === 0 && <EmptyState hasSearched={hasSearched} />}
      </section>
    </>
  );
}

function ApplicationsView({ savedJobs, applications, onStatus }: { savedJobs: SavedJobRecord[]; applications: ApplicationRecord[]; onStatus: (applicationId: string, status: ApplicationStatus) => void }) {
  const acceptedJobs = savedJobs.filter((job) => job.decision === "accepted");
  return (
    <>
      <SectionHeading eyebrow="Seguimiento" title="Mis postulaciones" copy="Aceptar una vacante la agrega aquí como preparación. JobPilot nunca envía la solicitud por sí solo." />
      <div className="notice"><span>✓</span><span><strong>Tu revisión sigue siendo obligatoria:</strong> cambia el estado cuando completes cada etapa en el portal de la empresa.</span></div>
      <section className="workspace-list">
        {acceptedJobs.map((job) => {
          const application = applications.find((item) => item.saved_job_id === job.id);
          return (
            <article className="workspace-card" key={job.id}>
              <div><span className="source-badge">{job.source}</span><h2>{job.title}</h2><p>{job.company} · {job.location}</p><small>Aceptada para preparar el {formatDateTime(job.decided_at)}</small></div>
              <div className="application-controls">
                <label htmlFor={`status-${job.id}`}>Estado</label>
                <select id={`status-${job.id}`} value={application?.status ?? "preparing"} disabled={!application} onChange={(event) => application && onStatus(application.id, event.target.value as ApplicationStatus)}>
                  <option value="preparing">Preparando</option><option value="applied">Postulado</option><option value="interview">Entrevista</option><option value="offer">Oferta</option><option value="rejected">No continuó</option><option value="withdrawn">Retirada</option>
                </select>
                <a className="job-link standalone" href={job.url} target="_blank" rel="noopener noreferrer">Abrir vacante ↗</a>
              </div>
            </article>
          );
        })}
        {acceptedJobs.length === 0 && <SimpleEmpty icon="✓" title="Aún no hay postulaciones en preparación" copy="Cuando aceptes una oportunidad, aparecerá aquí para darle seguimiento." />}
      </section>
    </>
  );
}

function ProfileView({ draft, onChange, onSave }: { draft: ProfileDraft; onChange: (draft: ProfileDraft) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <>
      <SectionHeading eyebrow="Base de compatibilidad" title="Mi perfil" copy="Estos datos se envían al buscador para decidir qué títulos y habilidades son compatibles contigo." />
      <form className="settings-card" onSubmit={onSave}>
        <div className="form-grid">
          <Field label="Nombre completo"><input value={draft.fullName} onChange={(event) => onChange({ ...draft, fullName: event.target.value })} required /></Field>
          <Field label="Ubicación"><input value={draft.location} onChange={(event) => onChange({ ...draft, location: event.target.value })} required /></Field>
          <Field label="Puestos objetivo" hint="Uno por línea"><textarea rows={7} value={draft.targetRolesText} onChange={(event) => onChange({ ...draft, targetRolesText: event.target.value })} required /></Field>
          <Field label="Habilidades" hint="Separadas por coma o por línea"><textarea rows={7} value={draft.skillsText} onChange={(event) => onChange({ ...draft, skillsText: event.target.value })} required /></Field>
        </div>
        <div className="form-footer"><span>Los cambios afectarán la próxima búsqueda.</span><button className="primary-button">Guardar perfil</button></div>
      </form>
    </>
  );
}

function FiltersView({ draft, sources, onChange, onToggleSource, onSave }: { draft: ProfileDraft; sources: SourceSettings; onChange: (draft: ProfileDraft) => void; onToggleSource: (source: keyof SourceSettings) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <>
      <SectionHeading eyebrow="Control de resultados" title="Fuentes y filtros" copy="Ajusta cuánta coincidencia necesitas y dónde debe buscar JobPilot." />
      <form className="settings-card" onSubmit={onSave}>
        <div className="filter-grid">
          <section className="setting-section">
            <h2>Compatibilidad</h2>
            <label className="range-label" htmlFor="minimum-score"><span>Puntaje mínimo recomendado</span><strong>{draft.minimumScore}%</strong></label>
            <input id="minimum-score" className="range-input" type="range" min="50" max="80" step="5" value={draft.minimumScore} onChange={(event) => onChange({ ...draft, minimumScore: Number(event.target.value) })} />
            <p>Las vacantes entre {Math.max(40, draft.minimumScore - 15)}% y {draft.minimumScore - 1}% aparecerán en “Posibles”.</p>
          </section>
          <section className="setting-section">
            <h2>Antigüedad</h2>
            <div className="age-rule"><strong>0–30 días</strong><span>Prioridad principal</span></div><div className="age-rule"><strong>31–60 días</strong><span>Baja prioridad</span></div><div className="age-rule"><strong>Más de 60</strong><span>Descartadas</span></div>
          </section>
        </div>
        <section className="setting-section sources-section">
          <h2>Fuentes activas</h2>
          <label className="source-toggle"><input type="checkbox" checked={sources.brave} onChange={() => onToggleSource("brave")} /><span><strong>Búsqueda web Brave</strong><small>Workday, LinkedIn, Indeed, Computrabajo, Greenhouse, Lever y más. Usa hasta siete consultas por búsqueda.</small></span></label>
          <label className="source-toggle"><input type="checkbox" checked={sources.remotive} onChange={() => onToggleSource("remotive")} /><span><strong>Remotive</strong><small>Fuente directa de puestos remotos internacionales compatibles con LATAM.</small></span></label>
        </section>
        <div className="form-footer"><span>Siempre debe quedar al menos una fuente activa.</span><button className="primary-button">Guardar filtros</button></div>
      </form>
    </>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <section className="section-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="hero-copy">{copy}</p></section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="stat-card"><span className="stat-label"><i className="stat-dot" style={{ background: color }} />{label}</span><strong className="stat-value">{value}</strong></div>;
}

function JobCard({ job, minimumScore, onDecide, onOpen }: { job: JobOpportunity; minimumScore: number; onDecide: (id: string, decision: JobDecision) => void; onOpen: (job: JobOpportunity) => void }) {
  const possible = job.score < minimumScore;
  return (
    <article className={`job-card ${possible ? "possible" : ""}`}>
      <div className="job-card-main">
        <div>
          <div className="job-source-row"><span className="source-badge">{job.source}</span><span className={`freshness-badge ${job.freshness}`}>{freshnessLabel(job)}</span>{job.remote && <span className="remote-badge">Remoto</span>}{possible && <span className="possible-badge">Posible · revisar</span>}</div>
          <h2 className="job-title">{job.title}</h2><p className="job-company">{job.company}</p><div className="job-meta"><span>⌖ {job.location}</span><span>Compatibilidad estimada</span></div>
          <ul className="reasons">{job.reasons.map((reason) => <li className="reason" key={reason}>✓ {reason}</li>)}</ul>
        </div>
        <div className={`score ${possible ? "possible" : ""}`} aria-label={`${job.score}% compatible`}>{job.score}<small>%</small></div>
      </div>
      <div className="job-actions">
        <button className={`action-button ${job.decision === "accepted" ? "accepted" : ""}`} onClick={() => onDecide(job.id, "accepted")}>✓ Aceptar</button><button className={`action-button ${job.decision === "saved" ? "saved" : ""}`} onClick={() => onDecide(job.id, "saved")}>☆ Guardar</button><button className={`action-button ${job.decision === "rejected" ? "rejected" : ""}`} onClick={() => onDecide(job.id, "rejected")}>× Descartar</button><a className="job-link" href={job.url} target="_blank" rel="noopener noreferrer" onClick={() => void onOpen(job)}>Ver vacante ↗</a>
      </div>
    </article>
  );
}

function EmptyState({ hasSearched }: { hasSearched: boolean }) {
  return <SimpleEmpty icon="⌕" title={hasSearched ? "No hay vacantes en esta sección" : "Tu radar está listo"} copy={hasSearched ? "Prueba otra pestaña; las coincidencias posibles se mantienen separadas de las recomendadas." : "Presiona “Buscar oportunidades” para consultar las fuentes sin enviar ninguna postulación."} />;
}

function SimpleEmpty({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{copy}</p></div>;
}

function freshnessLabel(job: JobOpportunity): string {
  if (job.freshness === "fresh") return job.daysOld === 0 ? "Hoy" : `Hace ${job.daysOld} días`;
  if (job.freshness === "older") return `${job.daysOld} días · baja prioridad`;
  return "Fecha por confirmar";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(new Date(value));
}

function syncLabel(state: SyncState, connected: boolean): string {
  if (!connected) return "Modo local";
  if (state === "saving") return "Guardando…";
  if (state === "error") return "Pendiente de sincronizar";
  if (state === "saved") return "Datos sincronizados";
  return "Supabase conectado";
}

function viewTitle(view: View): string {
  if (view === "opportunities") return "Búsqueda para Costa Rica";
  if (view === "applications") return "Seguimiento de postulaciones";
  if (view === "profile") return "Perfil profesional";
  return "Configuración del radar";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "L"}${parts.at(-1)?.[0] ?? "V"}`.toUpperCase();
}

function toDraft(profile: ProfileSettings): ProfileDraft {
  return { fullName: profile.fullName, location: profile.location, targetRolesText: profile.targetRoles.join("\n"), skillsText: profile.skills.join(", "), minimumScore: profile.minimumScore };
}

function fromDraft(draft: ProfileDraft, current: ProfileSettings): ProfileSettings {
  return { ...current, fullName: draft.fullName.trim(), location: draft.location.trim(), targetRoles: splitList(draft.targetRolesText), skills: splitList(draft.skillsText), minimumScore: Math.min(80, Math.max(50, Math.round(draft.minimumScore))) };
}

function splitList(value: string): string[] {
  return [...new Set(value.split(/\n|,/).map((item) => item.trim()).filter(Boolean))].slice(0, 15);
}

function applyLearnedAdjustment(job: JobOpportunity, history: SavedJobRecord[]): JobOpportunity {
  if (history.length < 3) return job;
  let adjustment = 0;
  const jobWords = significantWords(job.title);
  for (const previous of history.slice(0, 40)) {
    const preference = previous.decision === "accepted" ? 2 : previous.decision === "saved" ? 1 : -2;
    if (previous.source === job.source) adjustment += preference;
    if (previous.remote === job.remote) adjustment += preference * 0.5;
    if (significantWords(previous.title).some((word) => jobWords.includes(word))) adjustment += preference;
  }
  const rounded = Math.max(-10, Math.min(10, Math.round(adjustment)));
  if (rounded === 0) return job;
  return { ...job, score: Math.max(0, Math.min(100, job.score + rounded)), reasons: [...job.reasons.slice(0, 2), `Preferencias aprendidas ${rounded > 0 ? "+" : ""}${rounded}`] };
}

function significantWords(title: string): string[] {
  const ignored = new Set(["para", "with", "and", "the", "una", "del", "los", "las", "senior", "junior"]);
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !ignored.has(word));
}

function jobTraits(job: JobOpportunity): string[] {
  return [job.remote ? "modalidad:remoto" : "modalidad:presencial-o-hibrido", `fuente:${job.source.toLowerCase()}`, `rango:${Math.floor(job.score / 10) * 10}`, ...job.reasons.map((reason) => `motivo:${reason.toLowerCase()}`)];
}

function readSourceSettings(): SourceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem("jobpilot-sources") ?? "null") as Partial<SourceSettings> | null;
    return { brave: stored?.brave !== false, remotive: stored?.remotive !== false };
  } catch {
    return { brave: true, remotive: true };
  }
}

function readDecisions(): Record<string, JobDecision> {
  try {
    return JSON.parse(localStorage.getItem("jobpilot-decisions") ?? "{}") as Record<string, JobDecision>;
  } catch {
    return {};
  }
}
