import os
from datetime import datetime
from typing import Optional

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from botocore.exceptions import ClientError
from pydantic import BaseModel
from sqlalchemy import text
from app.classification.classifier import classify_message

from app.db.session import engine, SessionLocal, Base
from app.db.models import Message



app = FastAPI(title="SignalMap API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later lock this down to your frontend domain
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

from fastapi.responses import RedirectResponse
from botocore.exceptions import ClientError

@app.get("/media/{object_name:path}")
def get_media(object_name: str):
    try:
        s3.head_object(Bucket=AWS_S3_BUCKET_NAME, Key=object_name)

        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": AWS_S3_BUCKET_NAME,
                "Key": object_name,
            },
            ExpiresIn=3600,
        )

        return RedirectResponse(url=presigned_url, status_code=307)

    except ClientError:
        raise HTTPException(status_code=404, detail="Media not found")


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
            return {
    "message": "duplicate ignored",
    "id": existing.id,
    "region": existing.region,
    "country": existing.country,
    "event_domain": existing.event_domain,
    "event_type": existing.event_type,
    "event_subtype": existing.event_subtype,
    "weapon_type": existing.weapon_type,
    "claim_status": existing.claim_status,
    "confidence": existing.confidence,
    "media_url": existing.media_url,
}
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
            region=classification["region"],
            country=classification["country"],
            event_domain=classification["event_domain"],
            event_type=classification["event_type"],
            event_subtype=classification["event_subtype"],
            weapon_type=classification["weapon_type"],
            target_type=classification["target_type"],
            actor_primary=classification["actor_primary"],
            claim_status=classification["claim_status"],
            confidence=classification["confidence"],
            matched_terms=classification["matched_terms"],
            posted_at=message.posted_at,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        return {
        "message": "message inserted",
        "id": msg.id,
        "region": msg.region,
        "country": msg.country,
        "event_domain": msg.event_domain,
        "event_type": msg.event_type,
        "event_subtype": msg.event_subtype,
        "weapon_type": msg.weapon_type,
        "claim_status": msg.claim_status,
        "confidence": msg.confidence,
        "media_url": msg.media_url,
        }
    finally:
        db.close()


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


@app.get("/route-test")
def route_test():
    return {"route": "ROUTE TEST WORKS"}


@app.post("/test-message")
def create_test_message():
    db = SessionLocal()
    try:
        msg = Message(
            source_name="test_channel",
            external_message_id="12345",
            text="This is a test message from SignalMap.",
            has_media=False,
            media_type=None,
            media_path=None,
            media_url=None,
            media_object_key=None,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return {"message": "test message inserted", "id": msg.id}
    finally:
        db.close()


@app.get("/messages")
def get_messages():
    db = SessionLocal()
    try:
        messages = db.query(Message).order_by(Message.id.desc()).limit(20).all()
        return [
            {
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
    "matched_terms": m.matched_terms,
    "posted_at": m.posted_at,
    "collected_at": m.collected_at,
}
            for m in messages
        ]
    finally:
        db.close()


@app.get("/messages/by-source/{source_name}")
def get_messages_by_source(source_name: str):
    db = SessionLocal()
    try:
        messages = (
            db.query(Message)
            .filter(Message.source_name == source_name)
            .order_by(Message.id.desc())
            .limit(50)
            .all()
        )
        return [
            {
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
    "matched_terms": m.matched_terms,
    "posted_at": m.posted_at,
    "collected_at": m.collected_at,
}
            for m in messages
        ]
    finally:
        db.close()