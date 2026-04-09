"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";

const API_BASE = "https://signalmap-production-111b.up.railway.app";

type SourcePlatform = "telegram" | "x" | "instagram";

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
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

const DOMAIN_META: Record<string, { color: string; bg: string; label: string }> = {
  kinetic:             { color: "#dc2626", bg: "rgba(220,38,38,0.1)",   label: "KINETIC" },
  air_defense:         { color: "#ea580c", bg: "rgba(234,88,12,0.1)",   label: "AIR DEF" },
  political_diplomatic:{ color: "#2563eb", bg: "rgba(37,99,235,0.1)",   label: "DIPLOM" },
  cyber:               { color: "#7c3aed", bg: "rgba(124,58,237,0.1)",  label: "CYBER" },
  humanitarian:        { color: "#16a34a", bg: "rgba(22,163,74,0.1)",   label: "HUMINT" },
  intelligence:        { color: "#0891b2", bg: "rgba(8,145,178,0.1)",   label: "INTEL" },
};

const CLAIM_COLOR: Record<string, string> = {
  confirmed: "#16a34a",
  claimed:   "#2563eb",
  denied:    "#dc2626",
  disputed:  "#ea580c",
  unverified:"#6b7280",
};

const ESCALATION_META: Record<string, { color: string; label: string }> = {
  stable:   { color: "#16a34a", label: "STABLE" },
  elevated: { color: "#ca8a04", label: "ELEVATED" },
  high:     { color: "#ea580c", label: "HIGH" },
  critical: { color: "#dc2626", label: "CRITICAL" },
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

// Detect platform from source_name:
// X posts are stored with source_name = "@handle"
// Instagram posts are stored with plain "handle" (no @)
// Telegram posts are channel names / titles (no @)
function detectPlatform(source_name: string): SourcePlatform {
  if (source_name.startsWith("@")) return "x";
  // Instagram accounts configured without @ prefix
  // We can't perfectly distinguish IG from Telegram by name alone,
  // but we store IG accounts without @ and Telegram as channel titles
  // The best we can do: rely on source_name conventions set by each collector
  return "telegram";
}

function ConfidencePips({ level }: { level: string | null }) {
  const levels = ["low", "medium", "high"];
  const idx = levels.indexOf(level ?? "");
  const colors = ["#dc2626", "#ca8a04", "#16a34a"];
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {levels.map((_, i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: i <= idx ? colors[Math.min(i, idx)] : "rgba(255,255,255,0.15)",
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
    width: "100%", padding: "8px 10px", borderRadius: 4,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.8)",
    fontSize: 11, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    outline: "none", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    marginBottom: 5, display: "block",
  };

  const fields: { label: string; key: keyof FilterState; opts: string[] }[] = [
    { label: "Region", key: "region", opts: uniq(items.map(i => i.region)) },
    { label: "Domain", key: "event_domain", opts: uniq(items.map(i => i.event_domain)) },
    { label: "Weapon", key: "weapon_type", opts: uniq(items.map(i => i.weapon_type)) },
    { label: "Actor", key: "actor_primary", opts: uniq(items.map(i => i.actor_primary)) },
    { label: "Claim Status", key: "claim_status", opts: uniq(items.map(i => i.claim_status)) },
    { label: "Confidence", key: "confidence", opts: ["high","medium","low"].filter(c => items.some(i => i.confidence === c)) },
  ];

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.7)",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.2s",
      }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(320px, 88vw)", zIndex: 100,
        background: "#0d1117",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        overflowY: "auto", padding: "0 0 40px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          position: "sticky", top: 0, background: "#0d1117", zIndex: 1,
        }}>
          <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
            FILTER OPS {activeCount > 0 && `[${activeCount}]`}
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {activeCount > 0 && (
              <button onClick={clearFilters} style={{
                fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10,
                color: "#dc2626", background: "none", border: "none",
                cursor: "pointer", letterSpacing: "0.08em",
              }}>CLR ALL</button>
            )}
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 2,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Search / Keyword</label>
            <input type="text" value={filters.search}
              onChange={e => setFilter("search", e.target.value)}
              placeholder="Source, country, term..."
              style={{ ...selStyle, fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}
            />
          </div>
          {fields.map(({ label, key, opts }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={labelStyle}>{label}</label>
              <div style={{ position: "relative" }}>
                <select value={filters[key]} onChange={e => setFilter(key, e.target.value)} style={selStyle}>
                  <option value="">ALL</option>
                  {opts.map(o => <option key={o} value={o}>{o.toUpperCase().replace(/_/g, " ")}</option>)}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none", fontSize: 9 }}>▼</span>
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
      <button onClick={() => setActive(true)} style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", aspectRatio: "16/9", maxHeight: 220,
        borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.5)", cursor: "pointer",
        marginBottom: 10, gap: 8, color: "rgba(255,255,255,0.5)",
        fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10,
        letterSpacing: "0.12em",
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
          <polygon points="12,10 24,16 12,22" fill="rgba(255,255,255,0.6)"/>
        </svg>
        <span>PLAY FOOTAGE</span>
      </button>
    );
  }
  return (
    <video src={url} controls autoPlay preload="metadata" style={{
      maxWidth: "100%", borderRadius: 2,
      border: "1px solid rgba(255,255,255,0.08)",
      marginBottom: 10, display: "block",
    }} />
  );
}

// Shared card body used by all three platform cards
function SignalCard({ item }: { item: MessageItem }) {
  const domain = DOMAIN_META[item.event_domain ?? ""] ?? { color: "#6b7280", bg: "rgba(107,114,128,0.08)", label: "UNK" };
  const claimColor = CLAIM_COLOR[item.claim_status ?? ""] ?? "#6b7280";

  return (
    <article style={{
      background: "#0d1117",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `2px solid ${domain.color}`,
      borderRadius: 0,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 8px", flex: 1, minWidth: 0 }}>
          {item.event_domain && (
            <span style={{
              fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontWeight: 600,
              letterSpacing: "0.12em", padding: "2px 6px", borderRadius: 0,
              background: domain.bg, color: domain.color,
              border: `1px solid ${domain.color}40`,
            }}>{domain.label}</span>
          )}
          <span style={{
            fontSize: 11, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            color: "#60a5fa", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", maxWidth: "160px",
          }}>{item.source_name}</span>
          {item.country && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}>
              {item.country.toUpperCase()}{item.region ? ` / ${item.region.toUpperCase()}` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ConfidencePips level={item.confidence} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', 'Courier New', monospace", whiteSpace: "nowrap" }}>
            {formatTime(item.posted_at ?? item.collected_at)}Z
          </span>
        </div>
      </div>

      {item.text && (
        <p style={{
          fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.72)",
          margin: "0 0 10px", fontFamily: "Georgia, serif", fontWeight: 400,
        }}>{item.text}</p>
      )}
      {!item.text && !item.media_url && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', 'Courier New', monospace", marginBottom: 10, fontStyle: "italic" }}>[MEDIA ONLY — NO TEXT]</p>
      )}

      {item.media_url && item.media_type === "image" && (
        <img src={item.media_url} alt="signal media" loading="lazy" style={{
          maxWidth: "100%", maxHeight: 220, objectFit: "cover",
          borderRadius: 0, border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 10, display: "block",
        }} />
      )}
      {item.media_url && item.media_type === "video" && <VideoPlayer url={item.media_url} />}
      {item.media_url && item.media_type === "document" && (
        <a href={item.media_url} target="_blank" rel="noreferrer" style={{
          fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, color: "#60a5fa",
          textDecoration: "none", display: "inline-block", marginBottom: 10, letterSpacing: "0.08em",
        }}>↗ DOCUMENT</a>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {[
          item.event_type && { label: "TYPE", value: item.event_type.toUpperCase().replace(/_/g," "), c: "rgba(255,255,255,0.35)" },
          item.weapon_type && { label: "WPN", value: item.weapon_type.toUpperCase().replace(/_/g," "), c: "#ea580c" },
          item.target_type && { label: "TGT", value: item.target_type.toUpperCase().replace(/_/g," "), c: "#7c3aed" },
          item.actor_primary && { label: "ACT", value: item.actor_primary.toUpperCase(), c: "#0891b2" },
          item.claim_status && { label: "CLAIM", value: item.claim_status.toUpperCase(), c: claimColor },
          item.has_media && item.media_type && { label: "MEDIA", value: item.media_type.toUpperCase(), c: "#6b7280" },
        ].filter(Boolean).map((tag: any) => (
          <span key={tag.label} style={{
            fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            padding: "2px 6px", borderRadius: 0,
            background: `${tag.c}12`,
            border: `1px solid ${tag.c}35`,
            color: tag.c,
            letterSpacing: "0.08em",
          }}>
            <span style={{ opacity: 0.45, marginRight: 3 }}>{tag.label}:</span>{tag.value}
          </span>
        ))}
      </div>
    </article>
  );
}

// X card — same data as SignalCard but with X branding on the source line
function XSignalCard({ item }: { item: MessageItem }) {
  const domain = DOMAIN_META[item.event_domain ?? ""] ?? { color: "#6b7280", bg: "rgba(107,114,128,0.08)", label: "UNK" };
  const claimColor = CLAIM_COLOR[item.claim_status ?? ""] ?? "#6b7280";

  return (
    <article style={{
      background: "#0d1117",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `2px solid ${domain.color}`,
      borderRadius: 0,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 8px", flex: 1, minWidth: 0 }}>
          {item.event_domain && (
            <span style={{
              fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
              letterSpacing: "0.12em", padding: "2px 6px", borderRadius: 0,
              background: domain.bg, color: domain.color,
              border: `1px solid ${domain.color}40`,
            }}>{domain.label}</span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "#60a5fa" }}>
              {item.source_name}
            </span>
          </span>
          {item.country && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}>
              {item.country.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ConfidencePips level={item.confidence} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', 'Courier New', monospace", whiteSpace: "nowrap" }}>
            {formatTime(item.posted_at ?? item.collected_at)}Z
          </span>
        </div>
      </div>

      {item.text && (
        <p style={{
          fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.75)",
          margin: "0 0 10px", fontFamily: "Georgia, serif",
        }}>{item.text}</p>
      )}

      {item.media_url && item.media_type === "image" && (
        <img src={item.media_url} alt="signal media" loading="lazy" style={{
          maxWidth: "100%", maxHeight: 220, objectFit: "cover",
          borderRadius: 0, border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 10, display: "block",
        }} />
      )}
      {item.media_url && item.media_type === "video" && <VideoPlayer url={item.media_url} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {[
          item.weapon_type && { label: "WPN", value: item.weapon_type.toUpperCase().replace(/_/g," "), c: "#ea580c" },
          item.claim_status && { label: "CLAIM", value: item.claim_status.toUpperCase(), c: claimColor },
          item.actor_primary && { label: "ACT", value: item.actor_primary.toUpperCase(), c: "#0891b2" },
        ].filter(Boolean).map((tag: any) => (
          <span key={tag.label} style={{
            fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            padding: "2px 6px", borderRadius: 0,
            background: `${tag.c}12`, border: `1px solid ${tag.c}35`,
            color: tag.c, letterSpacing: "0.08em",
          }}>
            <span style={{ opacity: 0.45, marginRight: 3 }}>{tag.label}:</span>{tag.value}
          </span>
        ))}
      </div>
    </article>
  );
}

// Instagram card — same data, IG branding
function IGSignalCard({ item }: { item: MessageItem }) {
  const domain = DOMAIN_META[item.event_domain ?? ""] ?? { color: "#6b7280", bg: "rgba(107,114,128,0.08)", label: "UNK" };
  const claimColor = CLAIM_COLOR[item.claim_status ?? ""] ?? "#6b7280";

  return (
    <article style={{
      background: "#0d1117",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `2px solid ${domain.color}`,
      borderRadius: 0,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 8px", flex: 1, minWidth: 0 }}>
          {item.event_domain && (
            <span style={{
              fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
              letterSpacing: "0.12em", padding: "2px 6px", borderRadius: 0,
              background: domain.bg, color: domain.color,
              border: `1px solid ${domain.color}40`,
            }}>{domain.label}</span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="rgba(255,255,255,0.5)" stroke="none"/>
            </svg>
            <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "#e879f9" }}>
              @{item.source_name}
            </span>
          </span>
          {item.country && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}>
              {item.country.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ConfidencePips level={item.confidence} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', 'Courier New', monospace", whiteSpace: "nowrap" }}>
            {formatTime(item.posted_at ?? item.collected_at)}Z
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {item.has_media && (
          <div style={{
            width: 72, height: 72, flexShrink: 0,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            {item.media_type === "video" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                <polygon points="10,8 18,12 10,16" fill="rgba(255,255,255,0.5)"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            )}
            <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace" }}>
              {item.media_type?.toUpperCase()}
            </span>
          </div>
        )}
        {item.text && (
          <p style={{
            fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.72)",
            margin: 0, fontFamily: "Georgia, serif", flex: 1,
          }}>{item.text}</p>
        )}
      </div>

      {item.media_url && item.media_type === "image" && (
        <img src={item.media_url} alt="signal media" loading="lazy" style={{
          maxWidth: "100%", maxHeight: 220, objectFit: "cover",
          borderRadius: 0, border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 10, display: "block",
        }} />
      )}
      {item.media_url && item.media_type === "video" && <VideoPlayer url={item.media_url} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {[
          item.claim_status && { label: "CLAIM", value: item.claim_status.toUpperCase(), c: claimColor },
          item.weapon_type && { label: "WPN", value: item.weapon_type.toUpperCase().replace(/_/g," "), c: "#ea580c" },
          item.has_media && item.media_type && { label: "MEDIA", value: item.media_type.toUpperCase(), c: "#6b7280" },
        ].filter(Boolean).map((tag: any) => (
          <span key={tag.label} style={{
            fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
            padding: "2px 6px", borderRadius: 0,
            background: `${tag.c}12`, border: `1px solid ${tag.c}35`,
            color: tag.c, letterSpacing: "0.08em",
          }}>
            <span style={{ opacity: 0.45, marginRight: 3 }}>{tag.label}:</span>{tag.value}
          </span>
        ))}
      </div>
    </article>
  );
}

function NarrativeCard({ n }: { n: Narrative }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ESCALATION_META[n.escalation_level] ?? { color: "#6b7280", label: n.escalation_level.toUpperCase() };

  return (
    <article style={{
      background: "#0d1117",
      border: "1px solid rgba(255,255,255,0.07)",
      borderLeft: `2px solid ${meta.color}`,
      borderRadius: 0,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px 10px", marginBottom: 8 }}>
        <span style={{
          fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.15em",
          padding: "2px 8px", borderRadius: 0,
          background: `${meta.color}15`, color: meta.color,
          border: `1px solid ${meta.color}40`,
        }}>{meta.label}</span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "rgba(255,255,255,0.4)" }}>
          {n.region.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "rgba(255,255,255,0.2)" }}>
          {n.signal_count} SIG · {formatTime(n.generated_at)}Z
        </span>
      </div>

      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "#e2e8f0",
        lineHeight: 1.4, margin: "0 0 8px",
        fontFamily: "Georgia, serif",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>{n.title}</h3>

      <p style={{
        fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.55)",
        fontFamily: "Georgia, serif", margin: 0,
        display: expanded ? "block" : "-webkit-box",
        WebkitLineClamp: expanded ? undefined : 3,
        WebkitBoxOrient: "vertical" as const,
        overflow: expanded ? "visible" : "hidden",
      }}>{n.summary}</p>

      {n.summary.length > 180 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9,
          color: "#60a5fa", background: "none", border: "none",
          cursor: "pointer", marginTop: 6, padding: 0,
          letterSpacing: "0.1em",
        }}>{expanded ? "▲ COLLAPSE" : "▼ EXPAND"}</button>
      )}

      {expanded && (n.key_actors.length > 0 || n.key_locations.length > 0) && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {n.key_actors.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.15em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 5 }}>ACTORS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {n.key_actors.map(a => (
                  <span key={a} style={{ fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "#0891b2", background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.2)", padding: "2px 6px", borderRadius: 0 }}>{a}</span>
                ))}
              </div>
            </div>
          )}
          {n.key_locations.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.15em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 5 }}>LOCATIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {n.key_locations.map(l => (
                  <span key={l} style={{ fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 0 }}>{l}</span>
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
  const [activeTab, setActiveTab] = useState<"feed" | "narratives">("feed");
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [narrativesLoading, setNarrativesLoading] = useState(false);
  const [narrativesError, setNarrativesError] = useState("");
  const [narrativeWindow, setNarrativeWindow] = useState(24);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sourcePlatform, setSourcePlatform] = useState<SourcePlatform>("telegram");
  const [utcTime, setUtcTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + "Z");
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch ALL messages (limit 500) so we can split by platform client-side
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages?limit=500`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setError(""); setLoading(false);
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

  // Split items by platform:
  // X: source_name starts with "@"
  // Instagram: source_name does NOT start with "@" and is in a known IG format
  //   (the instagram_collector stores plain usernames without @)
  //   We distinguish IG from Telegram by checking if the name looks like a
  //   social handle (lowercase, no spaces) vs a channel title (may have spaces/caps).
  //   This is a heuristic — if you want precision, add a "platform" column to the DB.
  const telegramItems = useMemo(() =>
    items.filter(i => !i.source_name.startsWith("@") && (i.source_name.includes(" ") || i.source_name === i.source_name.toUpperCase() || i.source_name.length > 20 || /[А-яЁё]/.test(i.source_name))),
    [items]
  );

  const xItems = useMemo(() =>
    items.filter(i => i.source_name.startsWith("@")),
    [items]
  );

  // Instagram: no @, looks like a handle (lowercase, no spaces, short)
  const igItems = useMemo(() =>
    items.filter(i => !i.source_name.startsWith("@") && !i.source_name.includes(" ") && i.source_name === i.source_name.toLowerCase() && i.source_name.length <= 30 && !/[А-яЁё]/.test(i.source_name) && !telegramItems.includes(i)),
    [items, telegramItems]
  );

  const applyFilters = useCallback((list: MessageItem[]) => {
    return list.filter(item => {
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
  }, [filters]);

  const filteredTelegram = useMemo(() => applyFilters(telegramItems), [telegramItems, applyFilters]);
  const filteredX = useMemo(() => applyFilters(xItems), [xItems, applyFilters]);
  const filteredIG = useMemo(() => applyFilters(igItems), [igItems, applyFilters]);

  const currentFiltered = sourcePlatform === "telegram" ? filteredTelegram : sourcePlatform === "x" ? filteredX : filteredIG;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const domainCounts = useMemo(() => ({
    kinetic: telegramItems.filter(i => i.event_domain === "kinetic").length,
    air_defense: telegramItems.filter(i => i.event_domain === "air_defense").length,
    political_diplomatic: telegramItems.filter(i => i.event_domain === "political_diplomatic").length,
    cyber: telegramItems.filter(i => i.event_domain === "cyber").length,
    high_conf: telegramItems.filter(i => i.confidence === "high").length,
  }), [telegramItems]);

  const uniqForSidebar = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean))).sort() as string[];

  const selStyle: React.CSSProperties = {
    width: "100%", padding: "7px 8px", borderRadius: 0,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.7)",
    fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    outline: "none", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
  };

  const PLATFORM_OPTIONS: { value: SourcePlatform; label: string; color: string }[] = [
    { value: "telegram", label: "TELEGRAM", color: "#60a5fa" },
    { value: "x", label: "X / TWITTER", color: "rgba(255,255,255,0.7)" },
    { value: "instagram", label: "INSTAGRAM", color: "#e879f9" },
  ];

  const currentPlatform = PLATFORM_OPTIONS.find(p => p.value === sourcePlatform)!;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-font-smoothing: antialiased; }
        body {
          background: #080b10;
          color: #e2e8f0;
          font-family: Georgia, serif;
          min-height: 100vh;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
        input, select, button { font-family: inherit; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        .signal-card { animation: fadeIn 0.18s ease both; }
        @keyframes blink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
        .blink { animation: blink 1s step-end infinite; }
        @media (min-width: 900px) {
          .desktop-sidebar { display: flex !important; }
          .filter-fab { display: none !important; }
        }
        @media (max-width: 899px) {
          .desktop-sidebar { display: none !important; }
        }
      `}</style>

      <FilterDrawer
        open={filterOpen} onClose={() => setFilterOpen(false)}
        filters={filters} setFilter={setFilter}
        clearFilters={() => setFilters(INIT_FILTERS)}
        activeCount={activeFilterCount} items={telegramItems}
      />

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,11,16,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{
          background: "rgba(220,38,38,0.08)",
          borderBottom: "1px solid rgba(220,38,38,0.15)",
          padding: "3px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, letterSpacing: "0.2em", color: "rgba(220,38,38,0.7)" }}>
            BY COLIN CAMMACK // OSINT // OPEN SOURCE ONLY
          </span>
          <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>
            {utcTime} UTC
          </span>
        </div>

        <div style={{
          maxWidth: 1280, margin: "0 auto",
          padding: "0 16px",
          height: 52,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 32, height: 32, border: "1px solid rgba(220,38,38,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}>
              <div style={{ width: 8, height: 8, background: "#dc2626", position: "absolute" }} />
              <div style={{ width: 20, height: 20, border: "1px solid rgba(220,38,38,0.3)", borderRadius: "50%", position: "absolute" }} />
            </div>
            <div>
              <div style={{
                fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontWeight: 400, fontSize: 15,
                letterSpacing: "0.2em", lineHeight: 1, color: "#f8fafc",
              }}>
                SIGNAL<span style={{ color: "#dc2626" }}>THREAD</span>
                <span className="blink" style={{ color: "#dc2626", marginLeft: 2 }}>_</span>
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 8, letterSpacing: "0.25em",
                color: "rgba(255,255,255,0.2)", marginTop: 2,
              }}>OSINT · CONFLICT MONITORING</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 1 }}>
            {(["feed", "narratives"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10,
                letterSpacing: "0.15em", textTransform: "uppercase",
                padding: "6px 12px", cursor: "pointer",
                color: activeTab === tab ? "#dc2626" : "rgba(255,255,255,0.3)",
                background: activeTab === tab ? "rgba(220,38,38,0.08)" : "transparent",
                border: activeTab === tab ? "1px solid rgba(220,38,38,0.3)" : "1px solid transparent",
                borderRadius: 0,
                whiteSpace: "nowrap",
              }}>
                {tab === "feed" ? `FEED${!loading ? ` [${currentFiltered.length}]` : ""}` : "SITREP"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: error ? "#dc2626" : "#16a34a", flexShrink: 0,
              boxShadow: error ? "0 0 6px #dc2626" : "0 0 6px #16a34a",
            }} />
            <span style={{
              fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9,
              color: error ? "#dc2626" : "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
            }}>{error ? "DEGRADED" : "LIVE"}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 80px" }}>
        <div style={{ display: "flex", gap: 20, paddingTop: 20, alignItems: "flex-start" }}>

          {/* Desktop Sidebar */}
          <aside className="desktop-sidebar" style={{
            width: 220, flexShrink: 0, position: "sticky", top: 90,
            flexDirection: "column", gap: 0,
            background: "#0d1117",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 0, overflow: "hidden",
          }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.25)" }}>// SOURCE PLATFORM</span>
            </div>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {PLATFORM_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSourcePlatform(opt.value)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 8px", marginBottom: 3, cursor: "pointer", borderRadius: 0,
                  background: sourcePlatform === opt.value ? "rgba(255,255,255,0.05)" : "transparent",
                  border: sourcePlatform === opt.value ? `1px solid ${opt.color}30` : "1px solid transparent",
                  color: sourcePlatform === opt.value ? opt.color : "rgba(255,255,255,0.3)",
                  fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10,
                  letterSpacing: "0.12em",
                  textAlign: "left",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: sourcePlatform === opt.value ? opt.color : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.25)" }}>// FILTERS</span>
                {activeFilterCount > 0 && (
                  <button onClick={() => setFilters(INIT_FILTERS)} style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, color: "#dc2626", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.08em" }}>
                    CLR [{activeFilterCount}]
                  </button>
                )}
              </div>
              <input type="text" value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
                placeholder="SEARCH..."
                style={{ ...selStyle, width: "100%", marginBottom: 8 }}
              />
              {[
                { label: "REGION", key: "region" as keyof FilterState, opts: uniqForSidebar(telegramItems.map(i => i.region)) },
                { label: "DOMAIN", key: "event_domain" as keyof FilterState, opts: uniqForSidebar(telegramItems.map(i => i.event_domain)) },
                { label: "WEAPON", key: "weapon_type" as keyof FilterState, opts: uniqForSidebar(telegramItems.map(i => i.weapon_type)) },
                { label: "ACTOR", key: "actor_primary" as keyof FilterState, opts: uniqForSidebar(telegramItems.map(i => i.actor_primary)) },
                { label: "CLAIM", key: "claim_status" as keyof FilterState, opts: uniqForSidebar(telegramItems.map(i => i.claim_status)) },
                { label: "CONF", key: "confidence" as keyof FilterState, opts: ["high","medium","low"].filter(c => telegramItems.some(i => i.confidence === c)) },
              ].map(({ label, key, opts }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 8, fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.18em", color: "rgba(255,255,255,0.22)", display: "block", marginBottom: 3 }}>{label}</label>
                  <div style={{ position: "relative" }}>
                    <select value={filters[key]} onChange={e => setFilter(key, e.target.value)} style={selStyle}>
                      <option value="">ALL</option>
                      {opts.map(o => <option key={o} value={o}>{o.toUpperCase().replace(/_/g," ")}</option>)}
                    </select>
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.2)", pointerEvents: "none", fontSize: 8 }}>▼</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 14px" }}>
              <div style={{ fontSize: 8, fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.2em", color: "rgba(255,255,255,0.2)", marginBottom: 8 }}>// SIGNAL BREAKDOWN</div>
              {[
                { label: "KINETIC", val: domainCounts.kinetic, color: "#dc2626" },
                { label: "AIR DEF", val: domainCounts.air_defense, color: "#ea580c" },
                { label: "DIPLOM", val: domainCounts.political_diplomatic, color: "#2563eb" },
                { label: "CYBER", val: domainCounts.cyber, color: "#7c3aed" },
                { label: "HIGH CONF", val: domainCounts.high_conf, color: "#16a34a" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', 'Courier New', monospace", letterSpacing: "0.08em" }}>{label}</span>
                  <span style={{ fontSize: 11, color, fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}>{val.toString().padStart(3, "0")}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Main Content */}
          <main style={{ flex: 1, minWidth: 0 }}>

            {activeTab === "feed" && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <select
                      value={sourcePlatform}
                      onChange={e => setSourcePlatform(e.target.value as SourcePlatform)}
                      style={{
                        padding: "7px 28px 7px 10px", borderRadius: 0,
                        background: "#0d1117",
                        border: `1px solid ${currentPlatform.color}40`,
                        color: currentPlatform.color,
                        fontSize: 10, fontFamily: "'Share Tech Mono', 'Courier New', monospace",
                        outline: "none", cursor: "pointer",
                        appearance: "none", WebkitAppearance: "none",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {PLATFORM_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: currentPlatform.color, pointerEvents: "none", fontSize: 9 }}>▼</span>
                  </div>

                  <button
                    className="filter-fab"
                    onClick={() => setFilterOpen(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "7px 12px", borderRadius: 0,
                      background: activeFilterCount > 0 ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${activeFilterCount > 0 ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.1)"}`,
                      color: activeFilterCount > 0 ? "#dc2626" : "rgba(255,255,255,0.4)",
                      fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, cursor: "pointer",
                      letterSpacing: "0.1em",
                    }}
                  >
                    FILTER{activeFilterCount > 0 ? ` [${activeFilterCount}]` : ""}
                  </button>

                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                </div>

                {loading && (
                  <div style={{
                    background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
                    padding: "48px 24px", textAlign: "center",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 11, letterSpacing: "0.15em",
                    color: "rgba(255,255,255,0.2)",
                  }}>LOADING SIGNALS...</div>
                )}
                {error && (
                  <div style={{
                    padding: "10px 14px", marginBottom: 12,
                    background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, color: "#dc2626", letterSpacing: "0.08em",
                  }}>⚠ {error.toUpperCase()}</div>
                )}

                {!loading && currentFiltered.length === 0 && !error && (
                  <div style={{
                    background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
                    padding: "48px 24px", textAlign: "center",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 11, letterSpacing: "0.1em",
                    color: "rgba(255,255,255,0.15)",
                  }}>
                    {sourcePlatform === "x"
                      ? "NO X SIGNALS YET — DEPLOY x_collector.py TO START INGESTING"
                      : sourcePlatform === "instagram"
                      ? "NO INSTAGRAM SIGNALS YET — DEPLOY instagram_collector.py TO START INGESTING"
                      : "NO SIGNALS MATCH CURRENT PARAMETERS"}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sourcePlatform === "telegram" && filteredTelegram.map((item, idx) => (
                    <div key={`${item.source_name}-${item.external_message_id}`}
                      className="signal-card"
                      style={{ animationDelay: `${Math.min(idx * 0.015, 0.2)}s` }}>
                      <SignalCard item={item} />
                    </div>
                  ))}

                  {sourcePlatform === "x" && filteredX.map((item, idx) => (
                    <div key={`${item.source_name}-${item.external_message_id}`}
                      className="signal-card"
                      style={{ animationDelay: `${Math.min(idx * 0.015, 0.2)}s` }}>
                      <XSignalCard item={item} />
                    </div>
                  ))}

                  {sourcePlatform === "instagram" && filteredIG.map((item, idx) => (
                    <div key={`${item.source_name}-${item.external_message_id}`}
                      className="signal-card"
                      style={{ animationDelay: `${Math.min(idx * 0.015, 0.2)}s` }}>
                      <IGSignalCard item={item} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "narratives" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.15em" }}>WINDOW:</span>
                  {[6, 12, 24, 48].map(h => (
                    <button key={h} onClick={() => setNarrativeWindow(h)} style={{
                      fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, cursor: "pointer",
                      padding: "5px 10px", borderRadius: 0, letterSpacing: "0.1em",
                      background: narrativeWindow === h ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)",
                      border: narrativeWindow === h ? "1px solid rgba(220,38,38,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      color: narrativeWindow === h ? "#dc2626" : "rgba(255,255,255,0.3)",
                    }}>{h}H</button>
                  ))}
                </div>

                {narrativesLoading && (
                  <div style={{
                    background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
                    padding: "48px 24px", textAlign: "center",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em",
                  }}>GENERATING SITREP...</div>
                )}
                {narrativesError && (
                  <div style={{
                    padding: "10px 14px", marginBottom: 12,
                    background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)",
                    fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 10, color: "#dc2626",
                  }}>⚠ {narrativesError.toUpperCase()}</div>
                )}
                {!narrativesLoading && narratives.length === 0 && !narrativesError && (
                  <div style={{
                    background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
                    padding: "48px 24px", textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'Share Tech Mono', 'Courier New', monospace", fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: "0.12em", marginBottom: 6 }}>NO SITREP AVAILABLE</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.1)", fontFamily: "'Share Tech Mono', monospace" }}>REPORTS AUTO-GENERATE EVERY {narrativeWindow}H</div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {narratives.map(n => <NarrativeCard key={n.id} n={n} />)}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {activeTab === "feed" && (
        <button
          className="filter-fab"
          onClick={() => setFilterOpen(true)}
          style={{
            position: "fixed", bottom: 20, right: 16, zIndex: 40,
            width: 46, height: 46, borderRadius: 0,
            background: "#0d1117",
            border: `1px solid ${activeFilterCount > 0 ? "rgba(220,38,38,0.5)" : "rgba(255,255,255,0.15)"}`,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: activeFilterCount > 0 ? "#dc2626" : "rgba(255,255,255,0.5)",
          }}
          aria-label="Open filters"
        >
          {activeFilterCount > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -6,
              width: 16, height: 16, borderRadius: 0,
              background: "#dc2626", fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #080b10",
            }}>{activeFilterCount}</span>
          )}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1 3h14M4 8h8M7 13h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square"/>
          </svg>
        </button>
      )}
    </>
  );
}