import os
from datetime import datetime
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text

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

MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")
os.makedirs(MEDIA_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


def classify_region(text: str) -> str | None:
    lowered = text.lower()

    if "tehran" in lowered or "iran" in lowered:
        return "Iran"
    if "ukraine" in lowered or "kharkiv" in lowered or "kyiv" in lowered:
        return "Ukraine"
    if "israel" in lowered or "gaza" in lowered:
        return "Israel/Gaza"

    return None


def classify_category(text: str) -> str | None:
    lowered = text.lower()

    if "drone" in lowered or "uav" in lowered:
        return "uav"
    if "explosion" in lowered or "blast" in lowered or "strike" in lowered:
        return "strike"
    if "missile" in lowered or "rocket" in lowered:
        return "missile"
    if "troop" in lowered or "convoy" in lowered:
        return "movement"

    return None


class MessageIn(BaseModel):
    source_name: str
    external_message_id: str
    text: Optional[str] = ""
    has_media: bool = False
    media_type: Optional[str] = None
    media_path: Optional[str] = None
    media_url: Optional[str] = None
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
            return {
                "message": "duplicate ignored",
                "id": existing.id,
                "region": existing.region,
                "category": existing.category,
                "media_url": existing.media_url,
            }

        safe_text = message.text or ""
        region = classify_region(safe_text)
        category = classify_category(safe_text)

        msg = Message(
            source_name=message.source_name,
            external_message_id=message.external_message_id,
            text=safe_text,
            has_media=message.has_media,
            media_type=message.media_type,
            media_path=message.media_path,
            media_url=message.media_url,
            region=region,
            category=category,
            posted_at=message.posted_at,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        return {
            "message": "message inserted",
            "id": msg.id,
            "region": msg.region,
            "category": msg.category,
            "media_url": msg.media_url,
        }
    finally:
        db.close()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("=== SIGNALMAP STARTUP RAN ===")
    print(f"=== MEDIA DIR: {MEDIA_DIR} ===")


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
                "region": m.region,
                "category": m.category,
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
                "region": m.region,
                "category": m.category,
                "posted_at": m.posted_at,
                "collected_at": m.collected_at,
            }
            for m in messages
        ]
    finally:
        db.close()