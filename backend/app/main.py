from fastapi import FastAPI
from sqlalchemy import text
from app.db.session import engine, SessionLocal, Base
from app.db.models import Message
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="SignalMap API")


class MessageIn(BaseModel):
    source_name: str
    external_message_id: str
    text: str
    has_media: bool = False

@app.post("/messages")
def create_message(message: MessageIn):
    db = SessionLocal()
    try:
        msg = Message(
            source_name=message.source_name,
            external_message_id=message.external_message_id,
            text=message.text,
            has_media=message.has_media,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return {
            "message": "message inserted",
            "id": msg.id,
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
                "posted_at": m.posted_at,
                "collected_at": m.collected_at,
            }
            for m in messages
        ]
    finally:
        db.close()