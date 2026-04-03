"use client";

import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "https://signalmap-production-111b.up.railway.app";

type MessageItem = {
  id: number;
  source_name: string;
  external_message_id: string;
  text: string | null;
  has_media: boolean;
  media_type: string | null;
  media_path: string | null;
  media_url: string | null;
  region: string | null;
  category: string | null;
  posted_at: string | null;
  collected_at: string | null;
};

function formatTime(value: string | null) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function Badge({ label }: { label: string }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/80">
      {label}
    </span>
  );
}

export default function SignalMapLiveFeed() {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All regions");
  const [category, setCategory] = useState("All categories");

  useEffect(() => {
    let cancelled = false;

    const fetchFeed = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages`, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setItems(Array.isArray(data) ? data : []);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load feed");
          setLoading(false);
        }
      }
    };

    fetchFeed();
    const interval = setInterval(fetchFeed, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.text?.toLowerCase().includes(search.toLowerCase()) ||
        item.source_name?.toLowerCase().includes(search.toLowerCase());

      const matchesRegion =
        region === "All regions" || (item.region ?? "Unclassified") === region;

      const matchesCategory =
        category === "All categories" ||
        (item.category ?? "Unclassified") === category;

      return matchesSearch && matchesRegion && matchesCategory;
    });
  }, [items, search, region, category]);

  const regionOptions = [
    "All regions",
    ...Array.from(new Set(items.map((item) => item.region ?? "Unclassified"))),
  ];

  const categoryOptions = [
    "All categories",
    ...Array.from(
      new Set(items.map((item) => item.category ?? "Unclassified"))
    ),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-cyan-300/80 mb-2">
              SignalMap
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Live Feed
            </h1>
            <p className="text-white/60 mt-3 max-w-2xl text-base md:text-lg">
              Live Telegram ingestion feed from your Railway API, refreshing
              automatically every 5 seconds.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-xs text-white/50 mb-1">Feed Status</div>
              <div className="text-sm font-medium">
                {error ? "Degraded" : "Live"}
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-xs text-white/50 mb-1">Messages Loaded</div>
              <div className="text-sm font-medium">{items.length}</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 col-span-2 md:col-span-1">
              <div className="text-xs text-white/50 mb-1">Refresh</div>
              <div className="text-sm font-medium">Every 5s</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[280px,1fr] gap-6">
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5 h-fit">
            <div className="text-lg font-medium mb-4">Filters</div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 block mb-2">
                  Search
                </label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-2xl bg-slate-900 border border-white/10 px-4 py-3 outline-none"
                  placeholder="Search messages or sources..."
                />
              </div>

              <div>
                <label className="text-sm text-white/60 block mb-2">
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full rounded-2xl bg-slate-900 border border-white/10 px-4 py-3 outline-none"
                >
                  {regionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-white/60 block mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-2xl bg-slate-900 border border-white/10 px-4 py-3 outline-none"
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {loading && (
              <div className="rounded-3xl bg-white/5 border border-white/10 p-6 text-white/70">
                Loading live feed...
              </div>
            )}

            {error && (
              <div className="rounded-3xl bg-red-500/10 border border-red-400/20 p-6 text-red-200">
                Failed to load live feed: {error}
              </div>
            )}

            {!loading && !error && filteredItems.length === 0 && (
              <div className="rounded-3xl bg-white/5 border border-white/10 p-6 text-white/70">
                No messages match the current filters.
              </div>
            )}

            {filteredItems.map((item) => (
              <div
                key={`${item.source_name}-${item.external_message_id}`}
                className="rounded-3xl bg-white/5 border border-white/10 p-5 md:p-6 shadow-2xl shadow-black/20"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm text-cyan-300 font-medium mb-1">
                      {item.source_name}
                    </div>
                    <div className="text-xs text-white/45">
                      Message #{item.external_message_id}
                    </div>
                  </div>
                  <div className="text-sm text-white/50">
                    {formatTime(item.collected_at)}
                  </div>
                </div>

                <p className="text-lg leading-8 text-white/90 mb-5 whitespace-pre-wrap break-words">
  {item.text || "[Media-only post]"}
</p>

{item.media_url && item.media_type === "image" && (
  <img
    src={item.media_url}
    alt="Post media"
    className="mb-5 w-full max-w-2xl rounded-2xl border border-white/10"
  />
)}

{item.media_url && item.media_type === "video" && (
  <video
    src={item.media_url}
    controls
    className="mb-5 w-full max-w-2xl rounded-2xl border border-white/10"
  />
)}

{item.media_url && item.media_type === "document" && (
  <a
    href={item.media_url}
    target="_blank"
    rel="noreferrer"
    className="mb-5 inline-block text-cyan-300 underline"
  >
    Open attachment
  </a>
)}

<div className="flex flex-wrap gap-2">
                  <Badge label={`Region: ${item.region ?? "Unclassified"}`} />
                  <Badge
                    label={`Category: ${item.category ?? "Unclassified"}`}
                  />
                  <Badge
                      label={`Media: ${
                      item.has_media ? item.media_type ?? "Yes" : "No"
  }`}
/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}