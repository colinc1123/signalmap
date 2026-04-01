from fastapi import FastAPI
from sqlalchemy import text
from app.db.session import engine, SessionLocal, Base
from app.db.models import Message

app = FastAPI(title="SignalMap API")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"message": "SignalMap API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-check")
def db_check():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"database": "connected"}
    finally:
        db.close()


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
        return {
            "message": "test message inserted",
            "id": msg.id
        }
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