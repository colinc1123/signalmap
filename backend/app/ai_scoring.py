import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

CONFIDENCE_SYSTEM = """You are an OSINT analyst scoring Telegram messages from conflict/geopolitical channels.

Given a message and its keyword-extracted classification, return a JSON object with:
- "confidence": one of "high", "medium", "low"
- "confidence_reason": one sentence explaining the score
- "claim_status": one of "confirmed", "claimed", "unverified", "disputed", "denied"
- "corrected_country": string or null (override keyword extraction if wrong)
- "corrected_event_domain": one of "kinetic", "air_defense", "political_diplomatic", "cyber", "humanitarian", "intelligence" or null
- "corrected_weapon_type": string or null
- "corrected_actor_primary": string or null

Confidence scoring guide:
- "high": Multiple corroborating details, named locations, specific units/weapons, timestamps, or official acknowledgement
- "medium": Some specifics but single-source, unverified, or partially vague
- "low": Vague, rumor-like, no specifics, or propaganda framing

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON."""


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


def score_message_confidence(text: str, classification: dict) -> dict:
    """
    Use Claude to assess confidence and correct classification fields.
    Returns a dict of override fields to merge into the classification.
    Falls back gracefully on any error.
    """
    if not text or len(text.strip()) < 20:
        return {}

    prompt = f"""Message text:
{text[:1500]}

Keyword-extracted classification:
{json.dumps(classification, indent=2)}

Score this signal."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=400,
            system=CONFIDENCE_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip any accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)

        overrides = {}
        if result.get("confidence"):
            overrides["confidence"] = result["confidence"]
        if result.get("confidence_reason"):
            overrides["confidence_reason"] = result["confidence_reason"]
        if result.get("claim_status"):
            overrides["claim_status"] = result["claim_status"]
        if result.get("corrected_country"):
            overrides["country"] = result["corrected_country"]
        if result.get("corrected_event_domain"):
            overrides["event_domain"] = result["corrected_event_domain"]
        if result.get("corrected_weapon_type"):
            overrides["weapon_type"] = result["corrected_weapon_type"]
        if result.get("corrected_actor_primary"):
            overrides["actor_primary"] = result["corrected_actor_primary"]

        return overrides

    except Exception as e:
        print(f"[AI SCORING ERROR] {e}")
        return {}


def generate_narrative(signals: list[dict], region: str | None = None) -> dict | None:
    """
    Generate a narrative situation report from a cluster of signals.
    signals: list of message dicts (text, source_name, posted_at, classification fields...)
    Returns dict with title, summary, key_actors, key_locations, escalation_level, last_updated
    """
    if not signals:
        return None

    # Build signal list for the prompt
    signal_lines = []
    for i, s in enumerate(signals[:40], 1):  # cap at 40 signals per narrative
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