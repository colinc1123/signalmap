from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.session import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String, nullable=False)
    external_message_id = Column(String, nullable=True)
    text = Column(Text, nullable=True)
    has_media = Column(Boolean, default=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    collected_at = Column(DateTime(timezone=True), server_default=func.now())