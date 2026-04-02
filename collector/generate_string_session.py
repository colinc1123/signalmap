import os
from dotenv import load_dotenv
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

load_dotenv()

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
phone = os.getenv("TELEGRAM_PHONE")

if not api_id or not api_hash or not phone:
    raise ValueError("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_PHONE in .env")

with TelegramClient(StringSession(), int(api_id), api_hash) as client:
    client.start(phone=phone)
    print("\nYOUR TELEGRAM STRING SESSION:\n")
    print(client.session.save())