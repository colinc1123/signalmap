"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";

const API_BASE = "https://signalmap-production-111b.up.railway.app";

type MessageItem = {
  id: number;
  source_name: string;
  external_message_id: string;
  text: string | null;
  has_media: boolean;
  media_type: string | null;
  media_url: string | null;
  region: string | null;
  country: string | null;
  event_domain: string | null;
  event_type: string | null;
  event_subtype: string | null;
  weapon_type: string | null;
  target_type: string | null;
  actor_primary: string | null;
  claim_status: string | null;
  confidence: string | null;
  confidence_reason: string | null;
  matched_terms: string | null;
  posted_at: string | null;
  collected_at: string | null;
};

type Narrative = {
  region: string;
  title: string;
  summary: string;
  key_actors: string[];
  key_locations: string[];
  escalation_level: "stable" | "elevated" | "high" | "critical";
  last_updated: string;
  signal_count: number;
};

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function humanize(val: string | null): string {
  if (!val) return "—";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DOMAIN_COLORS: Record<string, string> = {
  kinetic: "#ef4444",
  air_defense: "#f97316",
  political_diplomatic: "#3b82f6",
  cyber: "#a855f7",
  humanitarian: "#22c55e",
  intelligence: "#06b6d4",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444",
};

const CLAIM_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  claimed: "#3b82f6",
  denied: "#ef4444",
  disputed: "#f97316",
  unverified: "#94a3b8",
};

const ESCALATION_COLORS: Record<string, string> = {
  stable: "#22c55e",
  elevated: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function DomainDot({ domain }: { domain: string | null }) {
  const color = DOMAIN_COLORS[domain ?? ""] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: color, marginRight: 6, flexShrink: 0,
      boxShadow: `0 0 5px ${color}99`,
    }} />
  );
}

function Tag({ label, value, color }: { label: string; value: string | null; color?: string }) {
  if (!value || value === "—") return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
      letterSpacing: "0.03em", padding: "2px 7px", borderRadius: 3,
      background: color ? `${color}15` : "rgba(255,255,255,0.05)",
      border: `1px solid ${color ? `${color}40` : "rgba(255,255,255,0.09)"}`,
      color: color ?? "rgba(255,255,255,0.6)",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 9 }}>{label}</span>
      {humanize(value)}
    </span>
  );
}

function ConfidenceMeter({ level, reason }: { level: string | null; reason?: string | null }) {
  const bars = ["low", "medium", "high"];
  const idx = bars.indexOf(level ?? "");
  return (
    <span
      title={reason ?? `Confidence: ${level ?? "unknown"}`}
      style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", cursor: reason ? "help" : "default" }}
    >
      {bars.map((b, i) => (
        <span key={b} style={{
          width: 9, height: i === 0 ? 5 : i === 1 ? 8 : 11, borderRadius: 2,
          background: i <= idx ? CONFIDENCE_COLORS[b] : "rgba(255,255,255,0.1)",
          transition: "background 0.2s",
        }} />
      ))}
    </span>
  );
}

type FilterState = {
  search: string;
  region: string;
  event_domain: string;
  weapon_type: string;
  claim_status: string;
  confidence: string;
  actor_primary: string;
};

const INIT_FILTERS: FilterState = {
  search: "", region: "", event_domain: "",
  weapon_type: "", claim_status: "", confidence: "", actor_primary: "",
};

function FilterSelect({
  label, field, options, value, onChange,
}: {
  label: string; field: keyof FilterState; options: string[];
  value: string; onChange: (f: keyof FilterState, v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.3)",
      }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        style={{
          background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 4, color: value ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.3)",
          fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
          padding: "5px 28px 5px 9px", outline: "none", cursor: "pointer",
          appearance: "none", WebkitAppearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.25)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat", backgroundPosition: "right 9px center",
          width: "100%",
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{humanize(o)}</option>
        ))}
      </select>
    </div>
  );
}

function NarrativeCard({ narrative }: { narrative: Narrative }) {
  const [expanded, setExpanded] = useState(false);
  const color = ESCALATION_COLORS[narrative.escalation_level] ?? "#6b7280";
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`, borderRadius: 6,
      padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color, background: `${color}20`, border: `1px solid ${color}40`,
              padding: "2px 7px", borderRadius: 3,
            }}>
              {narrative.escalation_level}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              {narrative.region}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
              · {narrative.signal_count} signals · {formatTime(narrative.last_updated)}
            </span>
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 8 }}>
            {narrative.title}
          </h3>
          <p style={{
            fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.65)",
            fontFamily: "'Syne', sans-serif",
            display: expanded ? "block" : "-webkit-box",
            WebkitLineClamp: expanded ? undefined : 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: expanded ? "visible" : "hidden",
          }}>
            {narrative.summary}
          </p>
          {narrative.summary.length > 200 && (
            <button onClick={() => setExpanded(!expanded)} style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
              color: "#60a5fa", background: "none", border: "none",
              cursor: "pointer", marginTop: 4, letterSpacing: "0.04em",
            }}>
              {expanded ? "collapse ↑" : "read more ↓"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {narrative.key_actors.length > 0 && (
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 5 }}>Actors</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {narrative.key_actors.map((a) => (
                  <span key={a} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#06b6d4", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.25)", padding: "1px 6px", borderRadius: 3 }}>{a}</span>
                ))}
              </div>
            </div>
          )}
          {narrative.key_locations.length > 0 && (
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 5 }}>Locations</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {narrative.key_locations.map((l) => (
                  <span key={l} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", padding: "1px 6px", borderRadius: 3 }}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SignalMap() {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"feed" | "narratives">("feed");
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [narrativesLoading, setNarrativesLoading] = useState(false);
  const [narrativesError, setNarrativesError] = useState("");
  const [narrativeHours, setNarrativeHours] = useState(24);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages?limit=100`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setError("");
      setLoading(false);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feed error");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const iv = setInterval(fetchFeed, 5000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  const fetchNarratives = useCallback(async () => {
    setNarrativesLoading(true);
    setNarrativesError("");
    try {
      const res = await fetch(`${API_BASE}/narratives?hours=${narrativeHours}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setNarratives(data.narratives ?? []);
    } catch (err) {
      setNarrativesError(err instanceof Error ? err.message : "Narrative error");
    } finally {
      setNarrativesLoading(false);
    }
  }, [narrativeHours]);

  const setFilter = useCallback(
    (field: keyof FilterState, val: string) => setFilters((f) => ({ ...f, [field]: val })),
    []
  );

  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean))).sort() as string[];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = filters.search.toLowerCase();
      if (q && !item.text?.toLowerCase().includes(q) &&
          !item.source_name?.toLowerCase().includes(q) &&
          !item.country?.toLowerCase().includes(q) &&
          !item.matched_terms?.toLowerCase().includes(q)) return false;
      if (filters.region && item.region !== filters.region) return false;
      if (filters.event_domain && item.event_domain !== filters.event_domain) return false;
      if (filters.weapon_type && item.weapon_type !== filters.weapon_type) return false;
      if (filters.claim_status && item.claim_status !== filters.claim_status) return false;
      if (filters.confidence && item.confidence !== filters.confidence) return false;
      if (filters.actor_primary && item.actor_primary !== filters.actor_primary) return false;
      return true;
    });
  }, [items, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const domainCounts = useMemo(() => ({
    kinetic: items.filter((i) => i.event_domain === "kinetic").length,
    air_defense: items.filter((i) => i.event_domain === "air_defense").length,
    political_diplomatic: items.filter((i) => i.event_domain === "political_diplomatic").length,
    cyber: items.filter((i) => i.event_domain === "cyber").length,
    high_conf: items.filter((i) => i.confidence === "high").length,
  }), [items]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080b10; color: #e2e8f0; font-family: 'Syne', sans-serif; min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; transition: border-color 0.18s, background 0.18s; }
        .card:hover { background: rgba(255,255,255,0.045); border-color: rgba(255,255,255,0.11); }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        .msg-card { animation: fadeSlide 0.22s ease both; }
        @keyframes livePulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        .live-dot { animation: livePulse 2.2s infinite; }
        @keyframes pulseRing { 0% { transform:scale(1); opacity:0.7; } 100% { transform:scale(2.4); opacity:0; } }
        input:focus, select:focus { border-color: rgba(59,130,246,0.5) !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.12) !important; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 16px; border-radius: 4px; transition: all 0.15s; }
        .scan-line { position:fixed; top:0; left:0; right:0; bottom:0; background: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px); pointer-events:none; z-index:0; }
      `}</style>

      <div className="scan-line" />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
        {/* Header */}
        <header style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg,rgba(0,0,0,0.7) 0%,transparent 100%)",
          backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(59,130,246,0.55)" }} />
                <div style={{ position: "absolute", inset: 6, borderRadius: "50%", border: "1.5px solid rgba(239,68,68,0.45)" }} />
                <div style={{ position: "absolute", inset: "50%", transform: "translate(-50%,-50%)", width: 4, height: 4, borderRadius: "50%", background: "#ef4444" }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", lineHeight: 1, color: "#fff" }}>
                  SIGNAL<span style={{ color: "#3b82f6" }}>MAP</span>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, letterSpacing: "0.18em", color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                  OPEN SOURCE INTELLIGENCE
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)" }}>
              {(["feed", "narratives"] as const).map((tab) => (
                <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)} style={{
                  color: activeTab === tab ? "#fff" : "rgba(255,255,255,0.35)",
                  background: activeTab === tab ? "rgba(59,130,246,0.2)" : "transparent",
                  border: activeTab === tab ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                }}>
                  {tab === "feed" ? `Feed (${filteredItems.length})` : "Narratives"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ position: "relative", width: 7, height: 7 }}>
                  <div className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: error ? "#ef4444" : "#22c55e" }} />
                  {!error && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "pulseRing 2s infinite", opacity: 0 }} />}
                </div>
                <span style={{ color: error ? "#ef4444" : "rgba(255,255,255,0.4)" }}>{error ? "DEGRADED" : "LIVE"}</span>
              </div>
              {lastUpdate && (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>
                  {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </header>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px", display: "grid", gridTemplateColumns: "250px 1fr", gap: 20, alignItems: "start" }}>
          {/* Sidebar */}
          <aside style={{ position: "sticky", top: 72 }}>
            <div className="card" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(INIT_FILTERS)} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>
                    clear ({activeFilterCount})
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>Search</label>
                <input type="text" value={filters.search} onChange={(e) => setFilter("search", e.target.value)}
                  placeholder="keyword, source, country…"
                  style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 4, color: "rgba(255,255,255,0.88)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", padding: "5px 9px", outline: "none", width: "100%" }} />
              </div>

              <FilterSelect label="Region" field="region" options={uniq(items.map((i) => i.region))} value={filters.region} onChange={setFilter} />
              <FilterSelect label="Event Domain" field="event_domain" options={uniq(items.map((i) => i.event_domain))} value={filters.event_domain} onChange={setFilter} />
              <FilterSelect label="Weapon Type" field="weapon_type" options={uniq(items.map((i) => i.weapon_type))} value={filters.weapon_type} onChange={setFilter} />
              <FilterSelect label="Actor" field="actor_primary" options={uniq(items.map((i) => i.actor_primary))} value={filters.actor_primary} onChange={setFilter} />
              <FilterSelect label="Claim Status" field="claim_status" options={uniq(items.map((i) => i.claim_status))} value={filters.claim_status} onChange={setFilter} />
              <FilterSelect label="Confidence" field="confidence"
                options={["high", "medium", "low"].filter((c) => items.some((i) => i.confidence === c))}
                value={filters.confidence} onChange={setFilter} />

              {/* Stats */}
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  { label: "Kinetic", val: domainCounts.kinetic, color: "#ef4444" },
                  { label: "Air Defense", val: domainCounts.air_defense, color: "#f97316" },
                  { label: "Diplomatic", val: domainCounts.political_diplomatic, color: "#3b82f6" },
                  { label: "Cyber", val: domainCounts.cyber, color: "#a855f7" },
                  { label: "High Conf.", val: domainCounts.high_conf, color: "#22c55e" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            {/* ── FEED TAB ── */}
            {activeTab === "feed" && (
              <>
                {loading && (
                  <div className="card" style={{ padding: 32, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em" }}>
                    LOADING FEED…
                  </div>
                )}
                {error && (
                  <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#fca5a5", marginBottom: 14 }}>
                    ⚠ {error}
                  </div>
                )}
                {!loading && filteredItems.length === 0 && !error && (
                  <div className="card" style={{ padding: 32, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em" }}>
                    NO SIGNALS MATCH CURRENT FILTERS
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredItems.map((item, idx) => {
                    const domainColor = DOMAIN_COLORS[item.event_domain ?? ""] ?? "#6b7280";
                    const claimColor = CLAIM_COLORS[item.claim_status ?? ""] ?? "#6b7280";
                    return (
                      <article key={`${item.source_name}-${item.external_message_id}`}
                        className="card msg-card"
                        style={{ padding: "12px 14px", animationDelay: `${Math.min(idx * 0.025, 0.3)}s`, borderLeft: `2px solid ${domainColor}99` }}>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                            <DomainDot domain={item.event_domain} />
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, color: "#60a5fa" }}>{item.source_name}</span>
                            {item.country && <>
                              <span style={{ color: "rgba(255,255,255,0.14)", fontSize: 9 }}>/</span>
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{item.country}</span>
                            </>}
                            {item.region && <>
                              <span style={{ color: "rgba(255,255,255,0.14)", fontSize: 9 }}>·</span>
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{item.region}</span>
                            </>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <ConfidenceMeter level={item.confidence} reason={item.confidence_reason} />
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.22)" }}>
                              {formatTime(item.posted_at ?? item.collected_at)}
                            </span>
                          </div>
                        </div>

                        {item.text && (
                          <p style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.8)", marginBottom: 9, fontFamily: "'Syne', sans-serif", fontWeight: 400 }}>
                            {item.text}
                          </p>
                        )}
                        {!item.text && !item.media_url && (
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", fontFamily: "'IBM Plex Mono', monospace", marginBottom: 9, fontStyle: "italic" }}>[media-only signal]</p>
                        )}

                        {item.media_url && item.media_type === "image" && (
                          <img src={item.media_url} alt="signal media" style={{ maxWidth: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 9, display: "block" }} />
                        )}
                        {item.media_url && item.media_type === "video" && (
                          <video src={item.media_url} controls style={{ maxWidth: "100%", borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 9, display: "block" }} />
                        )}
                        {item.media_url && item.media_type === "document" && (
                          <a href={item.media_url} target="_blank" rel="noreferrer" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#60a5fa", textDecoration: "none", display: "inline-block", marginBottom: 9 }}>↗ open attachment</a>
                        )}

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          <Tag label="domain·" value={item.event_domain} color={domainColor} />
                          <Tag label="type·" value={item.event_type} />
                          <Tag label="sub·" value={item.event_subtype} />
                          <Tag label="weapon·" value={item.weapon_type} color="#f97316" />
                          <Tag label="target·" value={item.target_type} color="#a855f7" />
                          <Tag label="actor·" value={item.actor_primary} color="#06b6d4" />
                          <Tag label="claim·" value={item.claim_status} color={claimColor} />
                          {item.has_media && item.media_type && <Tag label="media·" value={item.media_type} color="#8b5cf6" />}
                        </div>

                        {item.matched_terms && (
                          <div style={{ marginTop: 7, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.03em" }}>
                            matched: {item.matched_terms}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── NARRATIVES TAB ── */}
            {activeTab === "narratives" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Window:</span>
                    {[6, 12, 24, 48].map((h) => (
                      <button key={h} onClick={() => setNarrativeHours(h)} style={{
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, cursor: "pointer",
                        padding: "4px 10px", borderRadius: 4,
                        background: narrativeHours === h ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                        border: narrativeHours === h ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.08)",
                        color: narrativeHours === h ? "#93c5fd" : "rgba(255,255,255,0.35)",
                      }}>{h}h</button>
                    ))}
                  </div>
                  <button onClick={fetchNarratives} disabled={narrativesLoading} style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, cursor: narrativesLoading ? "not-allowed" : "pointer",
                    padding: "5px 14px", borderRadius: 4, letterSpacing: "0.08em",
                    background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)",
                    color: narrativesLoading ? "rgba(255,255,255,0.3)" : "#93c5fd",
                  }}>
                    {narrativesLoading ? "GENERATING…" : "GENERATE SITREP"}
                  </button>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                    uses AI · may take 10–20s
                  </span>
                </div>

                {narrativesError && (
                  <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#fca5a5", marginBottom: 14 }}>
                    ⚠ {narrativesError}
                  </div>
                )}

                {!narrativesLoading && narratives.length === 0 && !narrativesError && (
                  <div className="card" style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", marginBottom: 8 }}>NO SITUATION REPORTS GENERATED</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
                      Click "Generate SitRep" to run AI analysis across recent signals
                    </div>
                  </div>
                )}

                {narratives.map((n) => (
                  <NarrativeCard key={`${n.region}-${n.title}`} narrative={n} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}