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
  matched_terms: string | null;
  posted_at: string | null;
  collected_at: string | null;
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
  return val
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DOMAIN_COLORS: Record<string, string> = {
  kinetic: "#ef4444",
  air_defense: "#f97316",
  political_diplomatic: "#3b82f6",
  "—": "#6b7280",
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
  unverified: "#a855f7",
};

function DomainDot({ domain }: { domain: string | null }) {
  const color = DOMAIN_COLORS[domain ?? "—"] ?? "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
        flexShrink: 0,
        boxShadow: `0 0 6px ${color}88`,
      }}
    />
  );
}

function Tag({
  label,
  value,
  color,
}: {
  label: string;
  value: string | null;
  color?: string;
}) {
  if (!value || value === "—") return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500,
        letterSpacing: "0.03em",
        padding: "2px 8px",
        borderRadius: 3,
        background: color ? `${color}18` : "rgba(255,255,255,0.06)",
        border: `1px solid ${color ? `${color}44` : "rgba(255,255,255,0.1)"}`,
        color: color ?? "rgba(255,255,255,0.7)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
        {label}
      </span>
      {humanize(value)}
    </span>
  );
}

function ConfidenceMeter({ level }: { level: string | null }) {
  const bars = ["low", "medium", "high"];
  const idx = bars.indexOf(level ?? "");
  return (
    <span
      style={{ display: "inline-flex", gap: 2, alignItems: "center" }}
      title={`Confidence: ${level ?? "unknown"}`}
    >
      {bars.map((b, i) => (
        <span
          key={b}
          style={{
            width: 10,
            height: i === 0 ? 6 : i === 1 ? 9 : 12,
            borderRadius: 2,
            background:
              i <= idx
                ? CONFIDENCE_COLORS[b]
                : "rgba(255,255,255,0.12)",
            transition: "background 0.2s",
          }}
        />
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
  search: "",
  region: "",
  event_domain: "",
  weapon_type: "",
  claim_status: "",
  confidence: "",
  actor_primary: "",
};

function FilterSelect({
  label,
  field,
  options,
  value,
  onChange,
}: {
  label: string;
  field: keyof FilterState;
  options: string[];
  value: string;
  onChange: (field: keyof FilterState, val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.35)",
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          color: value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
          fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          padding: "6px 10px",
          outline: "none",
          cursor: "pointer",
          appearance: "none",
          WebkitAppearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: 28,
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {humanize(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SignalMap() {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setError("");
      setLoading(false);
      setLastUpdate(new Date());
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
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

  const setFilter = useCallback(
    (field: keyof FilterState, val: string) =>
      setFilters((f) => ({ ...f, [field]: val })),
    []
  );

  const uniq = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean))) as string[];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = filters.search.toLowerCase();
      if (
        q &&
        !item.text?.toLowerCase().includes(q) &&
        !item.source_name?.toLowerCase().includes(q) &&
        !item.country?.toLowerCase().includes(q) &&
        !item.matched_terms?.toLowerCase().includes(q)
      )
        return false;
      if (filters.region && item.region !== filters.region) return false;
      if (filters.event_domain && item.event_domain !== filters.event_domain)
        return false;
      if (filters.weapon_type && item.weapon_type !== filters.weapon_type)
        return false;
      if (filters.claim_status && item.claim_status !== filters.claim_status)
        return false;
      if (filters.confidence && item.confidence !== filters.confidence)
        return false;
      if (filters.actor_primary && item.actor_primary !== filters.actor_primary)
        return false;
      return true;
    });
  }, [items, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #080b10;
          color: #e2e8f0;
          font-family: 'Syne', sans-serif;
          min-height: 100vh;
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

        .card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px;
          transition: border-color 0.2s, background 0.2s;
        }
        .card:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.12);
        }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-card { animation: fadeSlide 0.25s ease both; }

        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .live-dot { animation: livePulse 2s infinite; }

        @keyframes pulseRing {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        input[type=text]:focus, select:focus {
          border-color: rgba(59,130,246,0.5) !important;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.15) !important;
        }

        .tag-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }

        .scan-line {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0.03) 4px
          );
          pointer-events: none;
          z-index: 0;
        }

        .noise {
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }
      `}</style>

      <div className="scan-line" />
      <div className="noise" />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
        {/* Header */}
        <header
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)",
            backdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              padding: "14px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Logo mark */}
              <div
                style={{
                  position: "relative",
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(59,130,246,0.6)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 6,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(239,68,68,0.5)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: "50%",
                    transform: "translate(-50%,-50%)",
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#ef4444",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: "#fff",
                  }}
                >
                  SIGNAL
                  <span style={{ color: "#3b82f6" }}>MAP</span>
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    color: "rgba(255,255,255,0.3)",
                    marginTop: 2,
                  }}
                >
                  OPEN SOURCE INTELLIGENCE
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
              }}
            >
              {/* Live indicator */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <div style={{ position: "relative", width: 8, height: 8 }}>
                  <div
                    className="live-dot"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: error ? "#ef4444" : "#22c55e",
                    }}
                  />
                  {!error && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        background: "#22c55e",
                        animation: "pulseRing 2s infinite",
                        opacity: 0,
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    color: error
                      ? "#ef4444"
                      : "rgba(255,255,255,0.5)",
                  }}
                >
                  {error ? "DEGRADED" : "LIVE"}
                </span>
              </div>

              <div
                style={{
                  color: "rgba(255,255,255,0.3)",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  paddingLeft: 20,
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.6)" }}>
                  {filteredItems.length}
                </span>
                /{items.length} signals
              </div>

              {lastUpdate && (
                <div style={{ color: "rgba(255,255,255,0.25)" }}>
                  upd {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </header>

        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "24px",
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Sidebar */}
          <aside style={{ position: "sticky", top: 80 }}>
            <div
              className="card"
              style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  Filters
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters(INIT_FILTERS)}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      color: "#3b82f6",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}
                  >
                    clear ({activeFilterCount})
                  </button>
                )}
              </div>

              {/* Search */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  Search
                </label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  placeholder="keyword, source, country…"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 4,
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    padding: "6px 10px",
                    outline: "none",
                    width: "100%",
                  }}
                />
              </div>

              <FilterSelect
                label="Region"
                field="region"
                options={uniq(items.map((i) => i.region))}
                value={filters.region}
                onChange={setFilter}
              />
              <FilterSelect
                label="Event Domain"
                field="event_domain"
                options={uniq(items.map((i) => i.event_domain))}
                value={filters.event_domain}
                onChange={setFilter}
              />
              <FilterSelect
                label="Weapon Type"
                field="weapon_type"
                options={uniq(items.map((i) => i.weapon_type))}
                value={filters.weapon_type}
                onChange={setFilter}
              />
              <FilterSelect
                label="Actor"
                field="actor_primary"
                options={uniq(items.map((i) => i.actor_primary))}
                value={filters.actor_primary}
                onChange={setFilter}
              />
              <FilterSelect
                label="Claim Status"
                field="claim_status"
                options={uniq(items.map((i) => i.claim_status))}
                value={filters.claim_status}
                onChange={setFilter}
              />
              <FilterSelect
                label="Confidence"
                field="confidence"
                options={["high", "medium", "low"].filter((c) =>
                  items.some((i) => i.confidence === c)
                )}
                value={filters.confidence}
                onChange={setFilter}
              />

              {/* Stats */}
              {items.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {[
                    {
                      label: "Kinetic",
                      val: items.filter((i) => i.event_domain === "kinetic")
                        .length,
                      color: "#ef4444",
                    },
                    {
                      label: "Air Defense",
                      val: items.filter(
                        (i) => i.event_domain === "air_defense"
                      ).length,
                      color: "#f97316",
                    },
                    {
                      label: "Diplomatic",
                      val: items.filter(
                        (i) => i.event_domain === "political_diplomatic"
                      ).length,
                      color: "#3b82f6",
                    },
                    {
                      label: "High Conf.",
                      val: items.filter((i) => i.confidence === "high").length,
                      color: "#22c55e",
                    },
                  ].map(({ label, val, color }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                          color: "rgba(255,255,255,0.35)",
                        }}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          color,
                          fontWeight: 600,
                        }}
                      >
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Feed */}
          <main>
            {loading && (
              <div
                className="card"
                style={{
                  padding: 32,
                  textAlign: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.3)",
                  letterSpacing: "0.1em",
                }}
              >
                LOADING FEED…
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 6,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  color: "#fca5a5",
                  marginBottom: 16,
                }}
              >
                ⚠ {error}
              </div>
            )}

            {!loading && filteredItems.length === 0 && !error && (
              <div
                className="card"
                style={{
                  padding: 32,
                  textAlign: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.08em",
                }}
              >
                NO SIGNALS MATCH CURRENT FILTERS
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredItems.map((item, idx) => {
                const domainColor =
                  DOMAIN_COLORS[item.event_domain ?? "—"] ?? "#6b7280";
                const claimColor =
                  CLAIM_COLORS[item.claim_status ?? ""] ?? "#6b7280";

                return (
                  <article
                    key={`${item.source_name}-${item.external_message_id}`}
                    className="card msg-card"
                    style={{
                      padding: "14px 16px",
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      borderLeft: `2px solid ${domainColor}`,
                    }}
                  >
                    {/* Row 1: meta */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <DomainDot domain={item.event_domain} />
                        <span
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#60a5fa",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {item.source_name}
                        </span>
                        {item.country && (
                          <>
                            <span
                              style={{
                                color: "rgba(255,255,255,0.15)",
                                fontSize: 10,
                              }}
                            >
                              /
                            </span>
                            <span
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 11,
                                color: "rgba(255,255,255,0.5)",
                              }}
                            >
                              {item.country}
                            </span>
                          </>
                        )}
                        {item.region && (
                          <>
                            <span
                              style={{
                                color: "rgba(255,255,255,0.15)",
                                fontSize: 10,
                              }}
                            >
                              ·
                            </span>
                            <span
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 10,
                                color: "rgba(255,255,255,0.3)",
                              }}
                            >
                              {item.region}
                            </span>
                          </>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexShrink: 0,
                        }}
                      >
                        <ConfidenceMeter level={item.confidence} />
                        <span
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 10,
                            color: "rgba(255,255,255,0.25)",
                          }}
                        >
                          {formatTime(item.posted_at ?? item.collected_at)}
                        </span>
                      </div>
                    </div>

                    {/* Message text */}
                    {item.text && (
                      <p
                        style={{
                          fontSize: 13,
                          lineHeight: 1.65,
                          color: "rgba(255,255,255,0.82)",
                          marginBottom: 10,
                          fontFamily: "'Syne', sans-serif",
                          fontWeight: 400,
                        }}
                      >
                        {item.text}
                      </p>
                    )}

                    {/* Media */}
                    {item.media_url && item.media_type === "image" && (
                      <img
                        src={item.media_url}
                        alt="signal media"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 320,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid rgba(255,255,255,0.08)",
                          marginBottom: 10,
                          display: "block",
                        }}
                      />
                    )}
                    {item.media_url && item.media_type === "video" && (
                      <video
                        src={item.media_url}
                        controls
                        style={{
                          maxWidth: "100%",
                          borderRadius: 4,
                          border: "1px solid rgba(255,255,255,0.08)",
                          marginBottom: 10,
                          display: "block",
                        }}
                      />
                    )}
                    {item.media_url && item.media_type === "document" && (
                      <a
                        href={item.media_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          color: "#60a5fa",
                          textDecoration: "none",
                          display: "inline-block",
                          marginBottom: 10,
                        }}
                      >
                        ↗ open attachment
                      </a>
                    )}
                    {!item.text && !item.media_url && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.2)",
                          fontFamily: "'IBM Plex Mono', monospace",
                          marginBottom: 10,
                          fontStyle: "italic",
                        }}
                      >
                        [media-only signal]
                      </p>
                    )}

                    {/* Classifier tags */}
                    <div className="tag-row">
                      {item.event_domain && (
                        <Tag
                          label="domain·"
                          value={item.event_domain}
                          color={domainColor}
                        />
                      )}
                      {item.event_type && (
                        <Tag label="type·" value={item.event_type} />
                      )}
                      {item.event_subtype && (
                        <Tag label="sub·" value={item.event_subtype} />
                      )}
                      {item.weapon_type && (
                        <Tag
                          label="weapon·"
                          value={item.weapon_type}
                          color="#f97316"
                        />
                      )}
                      {item.target_type && (
                        <Tag
                          label="target·"
                          value={item.target_type}
                          color="#a855f7"
                        />
                      )}
                      {item.actor_primary && (
                        <Tag
                          label="actor·"
                          value={item.actor_primary}
                          color="#06b6d4"
                        />
                      )}
                      {item.claim_status && (
                        <Tag
                          label="claim·"
                          value={item.claim_status}
                          color={claimColor}
                        />
                      )}
                      {item.has_media && item.media_type && (
                        <Tag
                          label="media·"
                          value={item.media_type}
                          color="#8b5cf6"
                        />
                      )}
                    </div>

                    {/* Matched terms */}
                    {item.matched_terms && (
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                          color: "rgba(255,255,255,0.2)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        matched: {item.matched_terms}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}