import os
from dotenv import load_dotenv
from telethon import TelegramClient, events
import requests



load_dotenv()

signalmap_api_url = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
if not signalmap_api_url:
    raise ValueError("Missing SIGNALMAP_API_URL in .env")

target_channels_raw = os.getenv("TELEGRAM_TARGET_CHANNELS", "")
TARGET_CHANNELS = [c.strip().lower() for c in target_channels_raw.split(",") if c.strip()]

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
phone = os.getenv("TELEGRAM_PHONE")

if not api_id or not api_hash or not phone:
    raise ValueError("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_PHONE in .env")

client = TelegramClient("signalmap_session", int(api_id), api_hash)


@client.on(events.NewMessage)
async def handler(event):
    chat = await event.get_chat()

    chat_title = getattr(chat, "title", None)
    chat_username = getattr(chat, "username", None)

    identifiers = set()

    if chat_title:
        identifiers.add(chat_title.strip().lower())

    if chat_username:
        identifiers.add(chat_username.strip().lower())

    print(f"[DEBUG] title={chat_title} username={chat_username}")

    if TARGET_CHANNELS and identifiers.isdisjoint(TARGET_CHANNELS):
        return

    source_name = chat_title or chat_username or "unknown"
    message_id = str(event.message.id)
    text = event.message.message or ""
    timestamp = event.message.date
    has_media = event.message.media is not None

    payload = {
        "source_name": source_name,
        "external_message_id": message_id,
        "text": text,
        "has_media": has_media,
    }

    try:
        response = requests.post(
            f"{signalmap_api_url}/messages",
            json=payload,
            timeout=10,
        )

        print("\n[FORWARDED TO API]")
        print(f"source: {source_name}")
        print(f"message_id: {message_id}")
        print(f"timestamp: {timestamp}")
        print(f"status_code: {response.status_code}")
        print(f"response: {response.text}")
        print("-" * 50)

    except Exception as e:
        print("\n[API POST ERROR]")
        print(f"source: {source_name}")
        print(f"message_id: {message_id}")
        print(f"timestamp: {timestamp}")
        print(f"error: {e}")
        print("-" * 50)


async def main():
    await client.start(phone=phone)
    print("Telegram collector connected.")
    print("Listening for new messages...")
    await client.run_until_disconnected()


with client:
    client.loop.run_until_complete(main())