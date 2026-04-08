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
  id: number;
  region: string;
  window_hours: number;
  title: string;
  summary: string;
  key_actors: string[];
  key_locations: string[];
  escalation_level: "stable" | "elevated" | "high" | "critical";
  signal_count: number;
  last_signal_at: string | null;
  generated_at: string | null;
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

const DOMAIN_META: Record<string, { color: string; bg: string; label: string }> = {
  kinetic:             { color: "#f87171", bg: "rgba(248,113,113,0.08)", label: "Kinetic" },
  air_defense:         { color: "#fb923c", bg: "rgba(251,146,60,0.08)",  label: "Air Defense" },
  political_diplomatic:{ color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  label: "Diplomatic" },
  cyber:               { color: "#c084fc", bg: "rgba(192,132,252,0.08)", label: "Cyber" },
  humanitarian:        { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  label: "Humanitarian" },
  intelligence:        { color: "#22d3ee", bg: "rgba(34,211,238,0.08)",  label: "Intelligence" },
};

const CLAIM_COLOR: Record<string, string> = {
  confirmed: "#4ade80",
  claimed:   "#60a5fa",
  denied:    "#f87171",
  disputed:  "#fb923c",
  unverified:"#94a3b8",
};

const ESCALATION_META: Record<string, { color: string; label: string }> = {
  stable:   { color: "#4ade80", label: "Stable" },
  elevated: { color: "#facc15", label: "Elevated" },
  high:     { color: "#fb923c", label: "High" },
  critical: { color: "#f87171", label: "Critical" },
};

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

function ConfidencePips({ level }: { level: string | null }) {
  const levels = ["low", "medium", "high"];
  const idx = levels.indexOf(level ?? "");
  const colors = ["#f87171", "#facc15", "#4ade80"];
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {levels.map((_, i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: i <= idx ? colors[Math.min(i, idx)] : "rgba(255,255,255,0.12)",
          transition: "background 0.2s",
        }} />
      ))}
    </span>
  );
}

function FilterDrawer({
  open, onClose, filters, setFilter, clearFilters, activeCount, items,
}: {
  open: boolean; onClose: () => void;
  filters: FilterState; setFilter: (f: keyof FilterState, v: string) => void;
  clearFilters: () => void; activeCount: number; items: MessageItem[];
}) {
  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean))).sort() as string[];

  const selStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13, fontFamily: "'DM Mono', monospace",
    outline: "none", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace",
    marginBottom: 6, display: "block",
  };

  const fields: { label: string; key: keyof FilterState; opts: string[] }[] = [
    { label: "Region", key: "region", opts: uniq(items.map(i => i.region)) },
    { label: "Domain", key: "event_domain", opts: uniq(items.map(i => i.event_domain)) },
    { label: "Weapon", key: "weapon_type", opts: uniq(items.map(i => i.weapon_type)) },
    { label: "Actor", key: "actor_primary", opts: uniq(items.map(i => i.actor_primary)) },
    { label: "Claim", key: "claim_status", opts: uniq(items.map(i => i.claim_status)) },
    { label: "Confidence", key: "confidence", opts: ["high","medium","low"].filter(c => items.some(i => i.confidence === c)) },
  ];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.25s",
      }} />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(340px, 92vw)", zIndex: 100,
        background: "#0f1117",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        overflowY: "auto", padding: "0 0 40px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          position: "sticky", top: 0, background: "#0f1117", zIndex: 1,
        }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
            Filters {activeCount > 0 && `(${activeCount})`}
          </span>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {activeCount > 0 && (
              <button onClick={clearFilters} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: "#60a5fa", background: "none", border: "none",
                cursor: "pointer", letterSpacing: "0.06em",
              }}>Clear all</button>
            )}
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "24px 24px 0" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Search</label>
            <input
              type="text" value={filters.search}
              onChange={e => setFilter("search", e.target.value)}
              placeholder="Keyword, source, country…"
              style={{
                ...selStyle, background: "rgba(255,255,255,0.05)",
                fontFamily: "'DM Mono', monospace",
              }}
            />
          </div>
          {fields.map(({ label, key, opts }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{label}</label>
              <div style={{ position: "relative" }}>
                <select value={filters[key]} onChange={e => setFilter(key, e.target.value)} style={selStyle}>
                  <option value="">All</option>
                  {opts.map(o => <option key={o} value={o}>{humanize(o)}</option>)}
                </select>
                <span style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.3)", pointerEvents: "none", fontSize: 10,
                }}>▼</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", aspectRatio: "16/9", maxHeight: 260,
          borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.4)", cursor: "pointer",
          marginBottom: 12, gap: 10, color: "rgba(255,255,255,0.6)",
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          letterSpacing: "0.08em",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.12)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,250,0.3)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.4)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
        }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="17" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
          <polygon points="14,11 27,18 14,25" fill="rgba(255,255,255,0.7)"/>
        </svg>
        <span>Tap to play video</span>
      </button>
    );
  }

  return (
    <video
      src={url}
      controls
      autoPlay
      preload="metadata"
      style={{
        maxWidth: "100%", borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.07)",
        marginBottom: 12, display: "block",
      }}
    />
  );
}

function SignalCard({ item }: { item: MessageItem }) {
  const domain = DOMAIN_META[item.event_domain ?? ""] ?? { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "" };
  const claimColor = CLAIM_COLOR[item.claim_status ?? ""] ?? "#64748b";

  return (
    <article style={{
      background: "#13161e",
      border: "1px solid rgba(255,255,255,0.06)",
      borderLeft: `3px solid ${domain.color}`,
      borderRadius: 12,
      padding: "16px 18px",
      transition: "border-color 0.15s, background 0.15s",
    }}>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 10, marginBottom: 10,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", flex: 1, minWidth: 0 }}>
          {item.event_domain && (
            <span style={{
              fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
              letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 4,
              background: domain.bg, color: domain.color,
              border: `1px solid ${domain.color}30`,
              whiteSpace: "nowrap",
            }}>{domain.label || humanize(item.event_domain)}</span>
          )}
          <span style={{
            fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600,
            color: "#93c5fd", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", maxWidth: "160px",
          }}>{item.source_name}</span>
          {item.country && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}>
              {item.country}{item.region ? ` · ${item.region}` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ConfidencePips level={item.confidence} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
            {formatTime(item.posted_at ?? item.collected_at)}
          </span>
        </div>
      </div>

      {/* Text */}
      {item.text && (
        <p style={{
          fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,0.78)",
          margin: "0 0 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
        }}>{item.text}</p>
      )}
      {!item.text && !item.media_url && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Mono', monospace", marginBottom: 12, fontStyle: "italic" }}>[media-only signal]</p>
      )}

      {/* Media */}
      {item.media_url && item.media_type === "image" && (
        <img src={item.media_url} alt="signal media" loading="lazy" style={{
          maxWidth: "100%", maxHeight: 260, objectFit: "cover",
          borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)",
          marginBottom: 12, display: "block",
        }} />
      )}
      {item.media_url && item.media_type === "video" && (
        <VideoPlayer url={item.media_url} />
      )}
      {item.media_url && item.media_type === "document" && (
        <a href={item.media_url} target="_blank" rel="noreferrer" style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#60a5fa",
          textDecoration: "none", display: "inline-block", marginBottom: 12,
        }}>↗ View document</a>
      )}

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[
          item.event_type && { label: "type", value: humanize(item.event_type), c: "rgba(255,255,255,0.4)" },
          item.weapon_type && { label: "weapon", value: humanize(item.weapon_type), c: "#fb923c" },
          item.target_type && { label: "target", value: humanize(item.target_type), c: "#c084fc" },
          item.actor_primary && { label: "actor", value: item.actor_primary, c: "#22d3ee" },
          item.claim_status && { label: "claim", value: humanize(item.claim_status), c: claimColor },
          item.has_media && item.media_type && { label: "media", value: item.media_type, c: "#818cf8" },
        ].filter(Boolean).map((tag: any) => (
          <span key={tag.label} style={{
            fontSize: 10.5, fontFamily: "'DM Mono', monospace",
            padding: "2px 7px", borderRadius: 5,
            background: `${tag.c}10`,
            border: `1px solid ${tag.c}30`,
            color: tag.c,
            whiteSpace: "nowrap",
          }}>
            <span style={{ opacity: 0.5, marginRight: 4 }}>{tag.label}</span>{tag.value}
          </span>
        ))}
      </div>
    </article>
  );
}

function NarrativeCard({ n }: { n: Narrative }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ESCALATION_META[n.escalation_level] ?? { color: "#64748b", label: n.escalation_level };

  return (
    <article style={{
      background: "#13161e",
      border: "1px solid rgba(255,255,255,0.06)",
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginBottom: 10 }}>
        <span style={{
          fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em",
          textTransform: "uppercase", padding: "3px 9px", borderRadius: 5,
          background: `${meta.color}15`, color: meta.color,
          border: `1px solid ${meta.color}35`,
        }}>{meta.label}</span>
        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.45)" }}>
          {n.region}
        </span>
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.22)" }}>
          {n.signal_count} signals · {formatTime(n.generated_at)}
        </span>
      </div>

      <h3 style={{
        fontSize: 15, fontWeight: 600, color: "#f1f5f9",
        lineHeight: 1.4, margin: "0 0 10px",
        fontFamily: "'DM Sans', sans-serif",
      }}>{n.title}</h3>

      <p style={{
        fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.6)",
        fontFamily: "'DM Sans', sans-serif", margin: 0,
        display: expanded ? "block" : "-webkit-box",
        WebkitLineClamp: expanded ? undefined : 3,
        WebkitBoxOrient: "vertical" as const,
        overflow: expanded ? "visible" : "hidden",
      }}>{n.summary}</p>

      {n.summary.length > 180 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: "#60a5fa", background: "none", border: "none",
          cursor: "pointer", marginTop: 8, padding: 0,
          letterSpacing: "0.04em",
        }}>{expanded ? "Show less ↑" : "Read more ↓"}</button>
      )}

      {expanded && (n.key_actors.length > 0 || n.key_locations.length > 0) && (
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 16 }}>
          {n.key_actors.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.14em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 6 }}>Actors</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {n.key_actors.map(a => (
                  <span key={a} style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", padding: "2px 8px", borderRadius: 5 }}>{a}</span>
                ))}
              </div>
            </div>
          )}
          {n.key_locations.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.14em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 6 }}>Locations</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {n.key_locations.map(l => (
                  <span key={l} style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 5 }}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
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
  const [narrativeWindow, setNarrativeWindow] = useState(24);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages?limit=100`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setError(""); setLoading(false); setLastUpdate(new Date());
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

  const fetchNarratives = useCallback(async (window: number) => {
    setNarrativesLoading(true); setNarrativesError("");
    try {
      const res = await fetch(`${API_BASE}/narratives?window_hours=${window}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setNarratives(data.narratives ?? []);
    } catch (err) {
      setNarrativesError(err instanceof Error ? err.message : "Narrative error");
    } finally { setNarrativesLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "narratives") fetchNarratives(narrativeWindow);
  }, [activeTab, narrativeWindow, fetchNarratives]);

  const setFilter = useCallback(
    (field: keyof FilterState, val: string) => setFilters(f => ({ ...f, [field]: val })), []
  );

  const filteredItems = useMemo(() => {
    return items.filter(item => {
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
    kinetic: items.filter(i => i.event_domain === "kinetic").length,
    air_defense: items.filter(i => i.event_domain === "air_defense").length,
    political_diplomatic: items.filter(i => i.event_domain === "political_diplomatic").length,
    cyber: items.filter(i => i.event_domain === "cyber").length,
    high_conf: items.filter(i => i.confidence === "high").length,
  }), [items]);

  const uniqForSidebar = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean))).sort() as string[];

  const selStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.75)",
    fontSize: 12, fontFamily: "'DM Mono', monospace",
    outline: "none", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-font-smoothing: antialiased; }
        body { background: #0a0d14; color: #e2e8f0; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        input, select, button { font-family: inherit; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .signal-card { animation: fadeIn 0.2s ease both; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        .live-dot { animation: pulse 2s infinite; }
        /* Desktop sidebar visible */
        @media (min-width: 900px) {
          .desktop-sidebar { display: flex !important; }
          .filter-fab { display: none !important; }
        }
        @media (max-width: 899px) {
          .desktop-sidebar { display: none !important; }
        }
      `}</style>

      {/* Filter drawer (mobile) */}
      <FilterDrawer
        open={filterOpen} onClose={() => setFilterOpen(false)}
        filters={filters} setFilter={setFilter}
        clearFilters={() => setFilters(INIT_FILTERS)}
        activeCount={activeFilterCount} items={items}
      />

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(10,13,20,0.9)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          padding: "0 16px",
          height: 58,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <circle cx="13" cy="13" r="12" stroke="rgba(96,165,250,0.5)" strokeWidth="1.5"/>
              <circle cx="13" cy="13" r="6.5" stroke="rgba(248,113,113,0.4)" strokeWidth="1.2"/>
              <circle cx="13" cy="13" r="2.5" fill="#f87171"/>
            </svg>
            <div>
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16,
                letterSpacing: "-0.02em", lineHeight: 1, color: "#f8fafc",
              }}>
                Signal<span style={{ color: "#60a5fa" }}>Map</span>
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.22)", marginTop: 1,
              }}>OSINT MONITORING</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 2,
            background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            {(["feed", "narratives"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                color: activeTab === tab ? "#f8fafc" : "rgba(255,255,255,0.35)",
                background: activeTab === tab ? "rgba(96,165,250,0.18)" : "transparent",
                border: activeTab === tab ? "1px solid rgba(96,165,250,0.3)" : "1px solid transparent",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}>
                {tab === "feed" ? `Feed${!loading ? ` (${filteredItems.length})` : ""}` : "SitReps"}
              </button>
            ))}
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span className="live-dot" style={{
              width: 7, height: 7, borderRadius: "50%",
              background: error ? "#f87171" : "#4ade80", flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.08em",
              color: error ? "#f87171" : "rgba(255,255,255,0.35)",
              display: "none",
            }} id="status-label">{error ? "DEGRADED" : "LIVE"}</span>
            {lastUpdate && (
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: "rgba(255,255,255,0.2)",
                display: "none",
              }} id="time-label">{lastUpdate.toLocaleTimeString()}</span>
            )}
            <style>{`
              @media (min-width: 640px) {
                #status-label, #time-label { display: inline !important; }
              }
            `}</style>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 60px" }}>
        <div style={{ display: "flex", gap: 24, paddingTop: 24, alignItems: "flex-start" }}>

          {/* ── Desktop Sidebar ── */}
          <aside className="desktop-sidebar" style={{
            width: 240, flexShrink: 0, position: "sticky", top: 78,
            flexDirection: "column", gap: 0,
            background: "#0f1117",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, overflow: "hidden",
          }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>Filters</span>
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(INIT_FILTERS)} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}>
                    Clear ({activeFilterCount})
                  </button>
                )}
              </div>
              <input
                type="text" value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                placeholder="Search…"
                style={{
                  ...selStyle, width: "100%", marginBottom: 10,
                  background: "rgba(255,255,255,0.05)",
                }}
              />
              {[
                { label: "Region", key: "region" as keyof FilterState, opts: uniqForSidebar(items.map(i => i.region)) },
                { label: "Domain", key: "event_domain" as keyof FilterState, opts: uniqForSidebar(items.map(i => i.event_domain)) },
                { label: "Weapon", key: "weapon_type" as keyof FilterState, opts: uniqForSidebar(items.map(i => i.weapon_type)) },
                { label: "Actor", key: "actor_primary" as keyof FilterState, opts: uniqForSidebar(items.map(i => i.actor_primary)) },
                { label: "Claim", key: "claim_status" as keyof FilterState, opts: uniqForSidebar(items.map(i => i.claim_status)) },
                { label: "Confidence", key: "confidence" as keyof FilterState, opts: ["high","medium","low"].filter(c => items.some(i => i.confidence === c)) },
              ].map(({ label, key, opts }) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", display: "block", marginBottom: 4 }}>{label}</label>
                  <div style={{ position: "relative" }}>
                    <select value={filters[key]} onChange={e => setFilter(key, e.target.value)} style={selStyle}>
                      <option value="">All</option>
                      {opts.map(o => <option key={o} value={o}>{humanize(o)}</option>)}
                    </select>
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none", fontSize: 9 }}>▼</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 10 }}>Signal Breakdown</div>
              {[
                { label: "Kinetic", val: domainCounts.kinetic, color: "#f87171" },
                { label: "Air Defense", val: domainCounts.air_defense, color: "#fb923c" },
                { label: "Diplomatic", val: domainCounts.political_diplomatic, color: "#60a5fa" },
                { label: "Cyber", val: domainCounts.cyber, color: "#c084fc" },
                { label: "High Conf.", val: domainCounts.high_conf, color: "#4ade80" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{val}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main style={{ flex: 1, minWidth: 0 }}>

            {/* Feed Tab */}
            {activeTab === "feed" && (
              <>
                {/* Mobile filter bar */}
                <div style={{
                  display: "flex", gap: 8, marginBottom: 16, alignItems: "center",
                }}>
                  <button
                    className="filter-fab"
                    onClick={() => setFilterOpen(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", borderRadius: 9,
                      background: activeFilterCount > 0 ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${activeFilterCount > 0 ? "rgba(96,165,250,0.35)" : "rgba(255,255,255,0.1)"}`,
                      color: activeFilterCount > 0 ? "#93c5fd" : "rgba(255,255,255,0.5)",
                      fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M1 2.5h11M3 6.5h7M5 10.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
                  </button>
                  {filters.search.length === 0 && (
                    <div style={{ flex: 1, position: "relative" }} className="filter-fab">
                      <input
                        type="text" value={filters.search}
                        onChange={e => setFilter("search", e.target.value)}
                        placeholder="Search signals…"
                        style={{
                          width: "100%", padding: "8px 12px",
                          borderRadius: 9, fontSize: 13,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.8)", outline: "none",
                          fontFamily: "'DM Mono', monospace",
                        }}
                      />
                    </div>
                  )}
                </div>

                {loading && (
                  <div style={{
                    background: "#13161e", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "48px 24px", textAlign: "center",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.2)",
                  }}>Loading signals…</div>
                )}

                {error && (
                  <div style={{
                    padding: "12px 16px", marginBottom: 14, borderRadius: 10,
                    background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#fca5a5",
                  }}>⚠ {error}</div>
                )}

                {!loading && filteredItems.length === 0 && !error && (
                  <div style={{
                    background: "#13161e", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "48px 24px", textAlign: "center",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.18)",
                  }}>No signals match current filters</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredItems.map((item, idx) => (
                    <div key={`${item.source_name}-${item.external_message_id}`}
                      className="signal-card"
                      style={{ animationDelay: `${Math.min(idx * 0.02, 0.25)}s` }}>
                      <SignalCard item={item} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* SitReps Tab */}
            {activeTab === "narratives" && (
              <div>
                {/* Window selector */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
                  flexWrap: "wrap",
                }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 2 }}>Window:</span>
                  {[6, 12, 24, 48].map(h => (
                    <button key={h} onClick={() => setNarrativeWindow(h)} style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer",
                      padding: "5px 12px", borderRadius: 7,
                      background: narrativeWindow === h ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)",
                      border: narrativeWindow === h ? "1px solid rgba(96,165,250,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      color: narrativeWindow === h ? "#93c5fd" : "rgba(255,255,255,0.35)",
                      transition: "all 0.15s",
                    }}>{h}h</button>
                  ))}
                </div>

                {narrativesLoading && (
                  <div style={{
                    background: "#13161e", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "48px 24px", textAlign: "center",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.2)",
                  }}>Generating situation reports…</div>
                )}

                {narrativesError && (
                  <div style={{
                    padding: "12px 16px", marginBottom: 14, borderRadius: 10,
                    background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#fca5a5",
                  }}>⚠ {narrativesError}</div>
                )}

                {!narrativesLoading && narratives.length === 0 && !narrativesError && (
                  <div style={{
                    background: "#13161e", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "48px 24px", textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.18)", letterSpacing: "0.08em", marginBottom: 8 }}>No situation reports yet</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.12)" }}>Reports auto-generate every {narrativeWindow} hours.</div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {narratives.map(n => <NarrativeCard key={n.id} n={n} />)}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile filter FAB */}
      {activeTab === "feed" && (
        <button
          className="filter-fab"
          onClick={() => setFilterOpen(true)}
          style={{
            position: "fixed", bottom: 24, right: 20, zIndex: 40,
            width: 52, height: 52, borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            border: "none", cursor: "pointer", boxShadow: "0 4px 24px rgba(59,130,246,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}
          aria-label="Open filters"
        >
          {activeFilterCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              width: 18, height: 18, borderRadius: "50%",
              background: "#f87171", fontSize: 10, fontFamily: "'DM Mono', monospace",
              fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #0a0d14",
            }}>{activeFilterCount}</span>
          )}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M6 10h8M9 15h2" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </>
  );
}