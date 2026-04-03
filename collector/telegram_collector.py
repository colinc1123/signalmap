import os
from pathlib import Path
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import requests

load_dotenv()

signalmap_api_url = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
if not signalmap_api_url:
    raise ValueError("Missing SIGNALMAP_API_URL in .env")

target_channels_raw = os.getenv("TELEGRAM_TARGET_CHANNELS", "")
TARGET_CHANNELS = {c.strip().lower() for c in target_channels_raw.split(",") if c.strip()}

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
string_session = os.getenv("TELEGRAM_STRING_SESSION", "")

if not api_id or not api_hash or not string_session:
    raise ValueError("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_STRING_SESSION in .env")

# This needs to match wherever your shared volume is mounted.
# Example Railway shared volume path:
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "/data/media"))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# This should be your backend public URL, like:
# https://your-backend-production-url.up.railway.app
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "").rstrip("/")
if not BACKEND_BASE_URL:
    raise ValueError("Missing BACKEND_BASE_URL in .env")

client = TelegramClient(StringSession(string_session), int(api_id), api_hash)


def detect_media_type(message) -> str | None:
    if not message.media:
        return None

    if message.photo:
        return "image"

    # Safer than relying on message.video directly
    if getattr(message, "video", None):
        return "video"

    if message.document:
        mime_type = getattr(message.document, "mime_type", "") or ""
        if mime_type.startswith("video/"):
            return "video"
        if mime_type.startswith("image/"):
            return "image"
        return "document"

    return "other"


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

    media_type = None
    media_path = None
    media_url = None

    if has_media:
        media_type = detect_media_type(event.message)

        try:
            safe_source = "".join(c for c in source_name if c.isalnum() or c in ("-", "_")).strip()
            safe_source = safe_source or "unknown"

            extension = ""
            if media_type == "image":
                extension = ".jpg"
            elif media_type == "video":
                extension = ".mp4"

            filename = f"{safe_source}_{message_id}{extension}"
            saved_path = await client.download_media(
                event.message,
                file=str(MEDIA_DIR / filename)
            )

            if saved_path:
                media_path = str(saved_path)
                public_filename = Path(saved_path).name
                media_url = f"{BACKEND_BASE_URL}/media/{public_filename}"

        except Exception as e:
            print("\n[MEDIA DOWNLOAD ERROR]")
            print(f"source: {source_name}")
            print(f"message_id: {message_id}")
            print(f"error: {e}")
            print("-" * 50)

    payload = {
        "source_name": source_name,
        "external_message_id": message_id,
        "text": text,
        "has_media": has_media,
        "media_type": media_type,
        "media_path": media_path,
        "media_url": media_url,
        "posted_at": timestamp.isoformat() if timestamp else None,
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
        print(f"has_media: {has_media}")
        print(f"media_type: {media_type}")
        print(f"media_url: {media_url}")
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
    await client.start()
    print("Telegram collector connected.")
    print("Listening for new messages...")
    await client.run_until_disconnected()


with client:
    client.loop.run_until_complete(main())