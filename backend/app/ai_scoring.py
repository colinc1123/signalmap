import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

NARRATIVE_SYSTEM = """You are a senior OSINT analyst writing situation reports.

You will receive a list of recent signals (Telegram messages) from conflict monitoring channels, grouped by region or theme.

Write a concise, factual narrative summary (2-4 paragraphs) covering:
1. The main developments in this cluster of signals
2. Key actors, locations, and weapon systems mentioned
3. Assessment of reliability and what remains unconfirmed
4. Any notable patterns or escalation indicators

Tone: professional, precise, no editorializing. Write like a DIA or Jane's analyst.
Do not invent details not present in the signals.
Return a JSON object with:
- "title": short headline (max 10 words)
- "summary": the narrative text (plain paragraphs, no markdown)
- "key_actors": list of actor strings
- "key_locations": list of location strings
- "escalation_level": one of "stable", "elevated", "high", "critical"
- "last_updated": ISO timestamp string (use the most recent signal timestamp)

Respond ONLY with valid JSON."""


def generate_narrative(signals: list[dict], region: str | None = None) -> dict | None:
    """
    Generate a narrative situation report from a cluster of signals.
    signals: list of message dicts (text, source_name, posted_at, classification fields...)
    Returns dict with title, summary, key_actors, key_locations, escalation_level, last_updated
    """
    if not signals:
        return None

    signal_lines = []
    for i, s in enumerate(signals[:40], 1):
        line = f"[{i}] SOURCE:{s.get('source_name','?')} TIME:{s.get('posted_at','?')}\n"
        if s.get("text"):
            line += f"     TEXT: {s['text'][:400]}\n"
        meta = []
        for field in ["country", "event_domain", "event_type", "weapon_type", "actor_primary", "claim_status", "confidence"]:
            if s.get(field):
                meta.append(f"{field}={s[field]}")
        if meta:
            line += f"     META: {', '.join(meta)}"
        signal_lines.append(line)

    prompt = f"""Region/Theme: {region or 'Mixed'}

Recent signals ({len(signals)} total, showing up to 40):

{chr(10).join(signal_lines)}

Generate the situation report."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1200,
            system=NARRATIVE_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    except Exception as e:
        print(f"[NARRATIVE ERROR] {e}")
        return None