"use client";

import { useMemo, useState } from "react";
import type { DiscoveryResponse, Freshness, JobDecision, JobOpportunity } from "@/lib/jobs/types";

type Filter = "all" | Freshness | "accepted" | "saved";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Todas",
  fresh: "0–30 días",
  older: "31–60 días",
  unknown: "Fecha por confirmar",
  stale: "Más de 60 días",
  accepted: "Aceptadas",
  saved: "Guardadas",
};

export function JobDashboard() {
  const [jobs, setJobs] = useState<JobOpportunity[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setNotices([]);
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error("search-failed");
      const data = (await response.json()) as DiscoveryResponse;
      const saved = readDecisions();
      setJobs(data.jobs.map((job) => ({ ...job, decision: saved[job.id] ?? "new" })));
      setNotices(data.notices);
      setSearchedAt(data.searchedAt);
      setHasSearched(true);
      setFilter("all");
    } catch {
      setNotices(["No fue posible buscar en este momento. Revisa tu conexión e intenta otra vez."]);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function decide(id: string, decision: JobDecision) {
    const next = jobs.map((job) => job.id === id
      ? { ...job, decision: job.decision === decision ? "new" as const : decision }
      : job);
    setJobs(next);
    const decisions = Object.fromEntries(next.filter((job) => job.decision !== "new").map((job) => [job.id, job.decision]));
    localStorage.setItem("jobpilot-decisions", JSON.stringify(decisions));
  }

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    if (filter === "all") return job.decision !== "rejected";
    if (filter === "accepted" || filter === "saved") return job.decision === filter;
    return job.freshness === filter && job.decision !== "rejected";
  }), [jobs, filter]);

  const counts = {
    fresh: jobs.filter((job) => job.freshness === "fresh" && job.decision !== "rejected").length,
    accepted: jobs.filter((job) => job.decision === "accepted").length,
    saved: jobs.filter((job) => job.decision === "saved").length,
    review: jobs.filter((job) => job.freshness === "unknown" && job.decision !== "rejected").length,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">J</span><span className="brand-text">JobPilot CR</span></div>
        <div>
          <p className="sidebar-label">Espacio de trabajo</p>
          <nav className="nav-list" aria-label="Navegación principal">
            <button className="nav-item active"><span className="nav-icon">⌕</span><span className="nav-text">Oportunidades</span></button>
            <button className="nav-item"><span className="nav-icon">✓</span><span className="nav-text">Mis postulaciones</span></button>
            <button className="nav-item"><span className="nav-icon">◈</span><span className="nav-text">Mi perfil</span></button>
            <button className="nav-item"><span className="nav-icon">⚙</span><span className="nav-text">Fuentes y filtros</span></button>
          </nav>
        </div>
        <div className="sidebar-note">
          <strong>Control siempre en tus manos</strong>
          <span>JobPilot prepara; tú revisas y haces el envío final.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span className="topbar-title">Búsqueda para Costa Rica</span>
          <div className="profile-chip"><span>Luis Roberto Vega</span><div className="avatar">LV</div></div>
        </header>

        <div className="content">
          <section className="hero-row">
            <div>
              <p className="eyebrow">Radar de oportunidades</p>
              <h1>Vacantes que sí vale la pena revisar</h1>
              <p className="hero-copy">Priorizamos publicaciones de los últimos 30 días, compatibles con tu perfil y disponibles en Costa Rica o de forma remota para LATAM.</p>
            </div>
            <button className="primary-button" onClick={runSearch} disabled={loading}>
              {loading ? "Buscando…" : "⌕  Buscar oportunidades"}
            </button>
          </section>

          <section className="stats" aria-label="Resumen">
            <Stat label="Recientes" value={counts.fresh} color="#176b4d" />
            <Stat label="Aceptadas" value={counts.accepted} color="#2e608f" />
            <Stat label="Guardadas" value={counts.saved} color="#bd791b" />
            <Stat label="Fecha por revisar" value={counts.review} color="#776b8b" />
          </section>

          <div className="notice">
            <span>●</span>
            <span><strong>Regla de antigüedad:</strong> 0–30 días tienen prioridad; 31–60 días aparecen aparte; más de 60 días se descartan automáticamente.</span>
          </div>

          {notices.map((notice) => <div className="notice warning" key={notice}><span>!</span><span>{notice}</span></div>)}

          <section className="toolbar">
            <div className="tabs">
              {(Object.keys(FILTER_LABELS) as Filter[]).filter((key) => key !== "stale").map((key) => (
                <button key={key} className={`tab ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{FILTER_LABELS[key]}</button>
              ))}
            </div>
            <span className="results-meta">
              {searchedAt ? `${visibleJobs.length} resultados · ${formatTime(searchedAt)}` : "Aún sin buscar"}
            </span>
          </section>

          <section className="job-list">
            {visibleJobs.map((job) => <JobCard key={job.id} job={job} onDecide={decide} />)}
            {visibleJobs.length === 0 && <EmptyState hasSearched={hasSearched} filtered={jobs.length > 0} />}
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="stat-card"><span className="stat-label"><i className="stat-dot" style={{ background: color }} />{label}</span><strong className="stat-value">{value}</strong></div>;
}

function JobCard({ job, onDecide }: { job: JobOpportunity; onDecide: (id: string, decision: JobDecision) => void }) {
  return (
    <article className="job-card">
      <div className="job-card-main">
        <div>
          <div className="job-source-row">
            <span className="source-badge">{job.source}</span>
            <span className={`freshness-badge ${job.freshness}`}>{freshnessLabel(job)}</span>
            {job.remote && <span className="remote-badge">Remoto</span>}
          </div>
          <h2 className="job-title">{job.title}</h2>
          <p className="job-company">{job.company}</p>
          <div className="job-meta"><span>⌖ {job.location}</span><span>Compatibilidad estimada</span></div>
          <ul className="reasons">{job.reasons.map((reason) => <li className="reason" key={reason}>✓ {reason}</li>)}</ul>
        </div>
        <div className="score" aria-label={`${job.score}% compatible`}>{job.score}<small>%</small></div>
      </div>
      <div className="job-actions">
        <button className={`action-button ${job.decision === "accepted" ? "accepted" : ""}`} onClick={() => onDecide(job.id, "accepted")}>✓ Aceptar</button>
        <button className={`action-button ${job.decision === "saved" ? "saved" : ""}`} onClick={() => onDecide(job.id, "saved")}>☆ Guardar</button>
        <button className={`action-button ${job.decision === "rejected" ? "rejected" : ""}`} onClick={() => onDecide(job.id, "rejected")}>× Descartar</button>
        <a className="job-link" href={job.url} target="_blank" rel="noopener noreferrer">Ver vacante ↗</a>
      </div>
    </article>
  );
}

function EmptyState({ hasSearched, filtered }: { hasSearched: boolean; filtered: boolean }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⌕</div>
      <h2>{filtered ? "No hay vacantes en esta sección" : hasSearched ? "No encontramos coincidencias esta vez" : "Tu radar está listo"}</h2>
      <p>{filtered ? "Prueba otro filtro o vuelve a la vista de todas las oportunidades." : hasSearched ? "Puedes volver a buscar más tarde; las fuentes se actualizan durante el día." : "Presiona “Buscar oportunidades” para consultar fuentes compatibles sin enviar ninguna postulación."}</p>
    </div>
  );
}

function freshnessLabel(job: JobOpportunity): string {
  if (job.freshness === "fresh") return job.daysOld === 0 ? "Hoy" : `Hace ${job.daysOld} días`;
  if (job.freshness === "older") return `${job.daysOld} días · baja prioridad`;
  return "Fecha por confirmar";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function readDecisions(): Record<string, JobDecision> {
  try {
    return JSON.parse(localStorage.getItem("jobpilot-decisions") ?? "{}") as Record<string, JobDecision>;
  } catch {
    return {};
  }
}
