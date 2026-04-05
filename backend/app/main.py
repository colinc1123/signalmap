import json
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
from app.narrative_scheduler import start_scheduler

from app.db.session import engine, SessionLocal, Base
from app.db.models import Message, Narrative


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


# ── helpers ───────────────────────────────────────────────────────────────────

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


def narrative_to_dict(n: Narrative) -> dict:
    return {
        "id": n.id,
        "region": n.region,
        "window_hours": n.window_hours,
        "title": n.title,
        "summary": n.summary,
        "key_actors": json.loads(n.key_actors) if n.key_actors else [],
        "key_locations": json.loads(n.key_locations) if n.key_locations else [],
        "escalation_level": n.escalation_level,
        "signal_count": n.signal_count,
        "last_signal_at": n.last_signal_at,
        "generated_at": n.generated_at,
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
        classification = classify_message(safe_text)

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
            confidence_reason=None,
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


# ── narratives (read-only — generated by scheduler) ───────────────────────────

@app.get("/narratives")
def get_narratives(
    window_hours: int = Query(default=24, ge=6, le=48),
    region: Optional[str] = Query(default=None),
):
    """
    Return the most recently generated narratives for the given time window.
    Narratives are pre-generated by the background scheduler — no AI call here.
    """
    db = SessionLocal()
    try:
        q = db.query(Narrative).filter(Narrative.window_hours == window_hours)
        if region:
            q = q.filter(Narrative.region == region)
        narratives = q.order_by(Narrative.escalation_level, Narrative.signal_count.desc()).all()
        return {
            "window_hours": window_hours,
            "narratives": [narrative_to_dict(n) for n in narratives],
        }
    finally:
        db.close()


# ── system ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    start_scheduler()
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