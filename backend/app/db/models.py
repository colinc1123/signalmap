from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.session import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String, nullable=False, index=True)
    external_message_id = Column(String, nullable=False, index=True)
    text = Column(String, nullable=False)
    has_media = Column(Boolean, default=False)

    region = Column(String, nullable=True)
    category = Column(String, nullable=True)

    posted_at = Column(DateTime(timezone=True), nullable=True)
    collected_at = Column(DateTime(timezone=True), server_default=func.now())