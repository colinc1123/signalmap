import os
from datetime import datetime, timezone
from typing import Optional

import boto3
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from botocore.exceptions import ClientError
from pydantic import BaseModel
from sqlalchemy import text
from app.classification.classifier import classify_message
from app.ai_scoring import score_message_confidence, generate_narrative

from app.db.session import engine, SessionLocal, Base
from app.db.models import Message


app = FastAPI(title="SignalMap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "").rstrip("/")
AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

if not all([
    BACKEND_BASE_URL,
    AWS_ENDPOINT_URL,
    AWS_S3_BUCKET_NAME,
    AWS_DEFAULT_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
]):
    raise ValueError("Missing required backend environment variables")

s3 = boto3.client(
    "s3",
    endpoint_url=AWS_ENDPOINT_URL,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def message_to_dict(m: Message) -> dict:
    return {
        "id": m.id,
        "source_name": m.source_name,
        "external_message_id": m.external_message_id,
        "text": m.text,
        "has_media": m.has_media,
        "media_type": m.media_type,
        "media_path": m.media_path,
        "media_url": m.media_url,
        "media_object_key": m.media_object_key,
        "region": m.region,
        "country": m.country,
        "event_domain": m.event_domain,
        "event_type": m.event_type,
        "event_subtype": m.event_subtype,
        "weapon_type": m.weapon_type,
        "target_type": m.target_type,
        "actor_primary": m.actor_primary,
        "claim_status": m.claim_status,
        "confidence": m.confidence,
        "confidence_reason": m.confidence_reason,
        "matched_terms": m.matched_terms,
        "posted_at": m.posted_at,
        "collected_at": m.collected_at,
    }


# ── media proxy ───────────────────────────────────────────────────────────────

@app.get("/media/{object_name:path}")
def get_media(object_name: str):
    try:
        s3.head_object(Bucket=AWS_S3_BUCKET_NAME, Key=object_name)
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": object_name},
            ExpiresIn=3600,
        )
        return RedirectResponse(url=presigned_url, status_code=307)
    except ClientError:
        raise HTTPException(status_code=404, detail="Media not found")


# ── ingest ────────────────────────────────────────────────────────────────────

class MessageIn(BaseModel):
    source_name: str
    external_message_id: str
    text: Optional[str] = ""
    has_media: bool = False
    media_type: Optional[str] = None
    media_path: Optional[str] = None
    media_url: Optional[str] = None
    media_object_key: Optional[str] = None
    posted_at: Optional[datetime] = None


@app.post("/messages")
def create_message(message: MessageIn):
    db = SessionLocal()
    try:
        existing = (
            db.query(Message)
            .filter(
                Message.source_name == message.source_name,
                Message.external_message_id == message.external_message_id,
            )
            .first()
        )
        if existing:
            return {"message": "duplicate ignored", **message_to_dict(existing)}

        safe_text = message.text or ""

        # Step 1: keyword classification
        classification = classify_message(safe_text)

        # Step 2: AI confidence scoring + field correction (only if there's meaningful text)
        if safe_text.strip() and len(safe_text.strip()) >= 50:
            ai_overrides = score_message_confidence(safe_text, classification)
            classification.update(ai_overrides)

        print("CLASSIFICATION:", classification)

        generated_media_url = (
            f"{BACKEND_BASE_URL}/media/{message.media_object_key}"
            if message.media_object_key
            else None
        )

        msg = Message(
            source_name=message.source_name,
            external_message_id=message.external_message_id,
            text=safe_text,
            has_media=message.has_media,
            media_type=message.media_type,
            media_path=None,
            media_url=generated_media_url,
            media_object_key=message.media_object_key,
            region=classification.get("region"),
            country=classification.get("country"),
            event_domain=classification.get("event_domain"),
            event_type=classification.get("event_type"),
            event_subtype=classification.get("event_subtype"),
            weapon_type=classification.get("weapon_type"),
            target_type=classification.get("target_type"),
            actor_primary=classification.get("actor_primary"),
            claim_status=classification.get("claim_status"),
            confidence=classification.get("confidence"),
            confidence_reason=classification.get("confidence_reason"),
            matched_terms=classification.get("matched_terms"),
            posted_at=message.posted_at,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        return {"message": "message inserted", **message_to_dict(msg)}
    finally:
        db.close()


# ── read messages ─────────────────────────────────────────────────────────────

@app.get("/messages")
def get_messages(
    limit: int = Query(default=100, ge=1, le=500),
    region: Optional[str] = Query(default=None),
    event_domain: Optional[str] = Query(default=None),
    country: Optional[str] = Query(default=None),
    confidence: Optional[str] = Query(default=None),
):
    db = SessionLocal()
    try:
        q = db.query(Message)
        if region:
            q = q.filter(Message.region == region)
        if event_domain:
            q = q.filter(Message.event_domain == event_domain)
        if country:
            q = q.filter(Message.country == country)
        if confidence:
            q = q.filter(Message.confidence == confidence)
        messages = q.order_by(Message.id.desc()).limit(limit).all()
        return [message_to_dict(m) for m in messages]
    finally:
        db.close()


@app.get("/messages/by-source/{source_name}")
def get_messages_by_source(source_name: str, limit: int = Query(default=100, ge=1, le=500)):
    db = SessionLocal()
    try:
        messages = (
            db.query(Message)
            .filter(Message.source_name == source_name)
            .order_by(Message.id.desc())
            .limit(limit)
            .all()
        )
        return [message_to_dict(m) for m in messages]
    finally:
        db.close()


# ── narratives ────────────────────────────────────────────────────────────────

@app.get("/narratives")
def get_narratives(
    hours: int = Query(default=24, ge=1, le=168),
    region: Optional[str] = Query(default=None),
    min_signals: int = Query(default=3, ge=1),
):
    """
    Generate AI narrative situation reports grouped by region.
    Pulls signals from the last `hours` hours, groups by region,
    and generates a narrative for each group with >= min_signals signals.
    Results are NOT cached — call sparingly (costs API tokens).
    """
    db = SessionLocal()
    try:
        from sqlalchemy import func as sqlfunc

        cutoff_sql = text(
            "SELECT * FROM messages WHERE collected_at >= NOW() - INTERVAL ':hours hours' ORDER BY id DESC LIMIT 300"
        )
        # Use ORM instead for portability
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        q = db.query(Message).filter(Message.collected_at >= cutoff).order_by(Message.id.desc()).limit(300)
        if region:
            q = q.filter(Message.region == region)

        all_msgs = q.all()

        # Group by region
        by_region: dict[str, list] = {}
        for m in all_msgs:
            key = m.region or "Unknown"
            by_region.setdefault(key, []).append(message_to_dict(m))

        narratives = []
        for reg, signals in by_region.items():
            if len(signals) < min_signals:
                continue
            narrative = generate_narrative(signals, region=reg)
            if narrative:
                narrative["region"] = reg
                narrative["signal_count"] = len(signals)
                narratives.append(narrative)

        # Sort by escalation level
        escalation_order = {"critical": 0, "high": 1, "elevated": 2, "stable": 3}
        narratives.sort(key=lambda n: escalation_order.get(n.get("escalation_level", "stable"), 4))

        return {"narratives": narratives, "generated_at": datetime.now(timezone.utc).isoformat()}
    finally:
        db.close()


@app.post("/narratives/custom")
def get_custom_narrative(
    message_ids: list[int],
):
    """Generate a narrative for a specific set of message IDs."""
    if len(message_ids) > 60:
        raise HTTPException(status_code=400, detail="Max 60 messages per custom narrative")
    db = SessionLocal()
    try:
        messages = db.query(Message).filter(Message.id.in_(message_ids)).all()
        if not messages:
            raise HTTPException(status_code=404, detail="No messages found")
        signals = [message_to_dict(m) for m in messages]
        narrative = generate_narrative(signals, region="Custom Selection")
        if not narrative:
            raise HTTPException(status_code=500, detail="Narrative generation failed")
        narrative["signal_count"] = len(signals)
        return narrative
    finally:
        db.close()


# ── system ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("=== SIGNALMAP STARTUP RAN ===")


@app.get("/")
def root():
    return {"message": "ROOT WORKS"}


@app.get("/health")
def health():
    return {"status": "HEALTH WORKS"}


@app.get("/db-check")
def db_check():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"database": "CONNECTED"}
    finally:
        db.close()