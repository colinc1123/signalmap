"""
Background scheduler that generates narrative situation reports automatically.
Runs in-process using asyncio — no external scheduler needed.

Schedule:
  - 6h window:  regenerate every 6 hours
  - 12h window: regenerate every 12 hours
  - 24h window: regenerate every 24 hours
  - 48h window: regenerate every 48 hours

Priority regions always get a sitrep (even if signal count is low):
  Middle East, Eastern Europe, Americas
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

from app.ai_scoring import generate_narrative
from app.db.session import SessionLocal
from app.db.models import Message, Narrative

log = logging.getLogger("narrative_scheduler")

WINDOWS = [6, 12, 24, 48]
MIN_SIGNALS = 3

# These regions always get a sitrep even if signal count is below MIN_SIGNALS
PRIORITY_REGIONS = {"Middle East", "Eastern Europe", "Americas"}
# Minimum signals for priority regions (lower threshold)
MIN_SIGNALS_PRIORITY = 1


def _build_narratives_for_window(window_hours: int) -> list[dict]:
    """
    Pull signals from the last window_hours, group by region,
    call Claude for each group, return list of narrative dicts.
    Priority regions always get a sitrep.
    """
    db = SessionLocal()
    results = []
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        all_msgs = (
            db.query(Message)
            .filter(Message.collected_at >= cutoff)
            .order_by(Message.id.desc())
            .limit(500)
            .all()
        )

        # Group by region — skip signals with no identified region
        by_region: dict[str, list] = {}
        for m in all_msgs:
            if not m.region:
                continue
            key = m.region
            by_region.setdefault(key, []).append({
                "source_name": m.source_name,
                "text": m.text,
                "posted_at": m.posted_at.isoformat() if m.posted_at else None,
                "country": m.country,
                "event_domain": m.event_domain,
                "event_type": m.event_type,
                "weapon_type": m.weapon_type,
                "actor_primary": m.actor_primary,
                "claim_status": m.claim_status,
                "confidence": m.confidence,
            })

        # Ensure all priority regions are present (even with empty signal list)
        for region in PRIORITY_REGIONS:
            if region not in by_region:
                by_region[region] = []

        for region, signals in by_region.items():
            is_priority = region in PRIORITY_REGIONS
            min_threshold = MIN_SIGNALS_PRIORITY if is_priority else MIN_SIGNALS

            if len(signals) < min_threshold and not is_priority:
                continue

            # For priority regions with zero signals, generate a "no significant
            # activity" placeholder rather than calling Claude with nothing
            if len(signals) == 0 and is_priority:
                results.append({
                    "region": region,
                    "window_hours": window_hours,
                    "title": f"{region}: No significant activity",
                    "summary": (
                        f"No significant signals were detected for the {region} region "
                        f"in the past {window_hours} hours. This may indicate a quiet "
                        f"period or a gap in source coverage. Monitor open-source channels "
                        f"for updates."
                    ),
                    "key_actors": json.dumps([]),
                    "key_locations": json.dumps([]),
                    "escalation_level": "stable",
                    "signal_count": 0,
                    "last_signal_at": None,
                })
                continue

            log.info(f"Generating narrative: window={window_hours}h region={region} signals={len(signals)}")
            narrative = generate_narrative(signals, region=region)
            if not narrative:
                # Generate a fallback for priority regions if Claude fails
                if is_priority:
                    results.append({
                        "region": region,
                        "window_hours": window_hours,
                        "title": f"{region}: Signals under assessment",
                        "summary": (
                            f"Signal processing for {region} encountered an issue during "
                            f"the {window_hours}-hour window. {len(signals)} signal(s) were "
                            f"collected but the narrative could not be generated. "
                            f"Manual review of raw signals is recommended."
                        ),
                        "key_actors": json.dumps([]),
                        "key_locations": json.dumps([]),
                        "escalation_level": "stable",
                        "signal_count": len(signals),
                        "last_signal_at": None,
                    })
                continue

            results.append({
                "region": region,
                "window_hours": window_hours,
                "title": narrative.get("title", ""),
                "summary": narrative.get("summary", ""),
                "key_actors": json.dumps(narrative.get("key_actors") or []),
                "key_locations": json.dumps(narrative.get("key_locations") or []),
                "escalation_level": narrative.get("escalation_level", "stable"),
                "signal_count": len(signals),
                "last_signal_at": narrative.get("last_updated"),
            })
    finally:
        db.close()
    return results


def _save_narratives(narratives: list[dict]) -> None:
    """
    Delete old narratives for this window and region, insert fresh ones.
    """
    if not narratives:
        return
    db = SessionLocal()
    try:
        window_hours = narratives[0]["window_hours"]
        # Delete all existing narratives for this window
        db.query(Narrative).filter(Narrative.window_hours == window_hours).delete()
        for n in narratives:
            last_signal_at = None
            if n.get("last_signal_at"):
                try:
                    last_signal_at = datetime.fromisoformat(n["last_signal_at"].replace("Z", "+00:00"))
                except Exception:
                    pass
            row = Narrative(
                region=n["region"],
                window_hours=n["window_hours"],
                title=n["title"],
                summary=n["summary"],
                key_actors=n["key_actors"],
                key_locations=n["key_locations"],
                escalation_level=n["escalation_level"],
                signal_count=n["signal_count"],
                last_signal_at=last_signal_at,
            )
            db.add(row)
        db.commit()
        log.info(f"Saved {len(narratives)} narratives for {window_hours}h window")
    except Exception as e:
        db.rollback()
        log.error(f"Failed to save narratives: {e}")
    finally:
        db.close()


async def _run_window(window_hours: int) -> None:
    """Run narrative generation for one window, in a thread so it doesn't block."""
    loop = asyncio.get_event_loop()
    try:
        narratives = await loop.run_in_executor(
            None, _build_narratives_for_window, window_hours
        )
        if narratives:
            await loop.run_in_executor(None, _save_narratives, narratives)
    except Exception as e:
        log.error(f"Error generating {window_hours}h narratives: {e}")


async def scheduler_loop() -> None:
    """
    Main loop. Runs each window on its own interval.
    Staggers start times slightly so they don't all hit the API at once.
    """
    log.info("Narrative scheduler started")

    # Track when each window was last run
    last_run: dict[int, datetime] = {}

    # Stagger initial runs: 2 min apart so we don't hammer the API on startup
    stagger_seconds = 0
    for window in WINDOWS:
        last_run[window] = datetime.now(timezone.utc) - timedelta(hours=window) + timedelta(seconds=stagger_seconds)
        stagger_seconds += 120  # 2 minutes between each window's first run

    while True:
        now = datetime.now(timezone.utc)
        for window in WINDOWS:
            due_at = last_run[window] + timedelta(hours=window)
            if now >= due_at:
                log.info(f"Running {window}h narrative generation")
                await _run_window(window)
                last_run[window] = now
        # Check every 5 minutes whether any window is due
        await asyncio.sleep(300)


def start_scheduler() -> None:
    """Called from FastAPI startup — launches the scheduler as a background task."""
    loop = asyncio.get_event_loop()
    loop.create_task(scheduler_loop())