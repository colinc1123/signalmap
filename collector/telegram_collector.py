import os
import mimetypes
import tempfile
import time
from pathlib import Path

import boto3
import requests
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import AuthKeyDuplicatedError, AuthKeyUnregisteredError

load_dotenv()

signalmap_api_url = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
if not signalmap_api_url:
    raise ValueError("Missing SIGNALMAP_API_URL environment variable")

target_channels_raw = os.getenv("TELEGRAM_TARGET_CHANNELS", "")
TARGET_CHANNELS = {c.strip().lower() for c in target_channels_raw.split(",") if c.strip()}

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
string_session = os.getenv("TELEGRAM_STRING_SESSION", "")

if not api_id or not api_hash or not string_session:
    raise ValueError("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_STRING_SESSION")

BACKEND_BASE_URL = signalmap_api_url

AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

if not all([
    AWS_ENDPOINT_URL,
    AWS_S3_BUCKET_NAME,
    AWS_DEFAULT_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
]):
    raise ValueError("Missing Railway Bucket environment variables")

s3 = boto3.client(
    "s3",
    endpoint_url=AWS_ENDPOINT_URL,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION,
)

client = TelegramClient(StringSession(string_session), int(api_id), api_hash)


def detect_media_type(message) -> str | None:
    if not message.media:
        return None

    if message.photo:
        return "image"

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


def upload_file_to_bucket(local_path: str, object_key: str) -> None:
    content_type, _ = mimetypes.guess_type(local_path)
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    s3.upload_file(local_path, AWS_S3_BUCKET_NAME, object_key, ExtraArgs=extra_args)

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
    media_object_key = None
    media_url = None

    if has_media:
        media_type = detect_media_type(event.message)

        try:
            safe_source = "".join(
                c for c in source_name if c.isalnum() or c in ("-", "_")
            ).strip() or "unknown"

            with tempfile.TemporaryDirectory() as tmpdir:
                base_name = f"{safe_source}_{message_id}"
                saved_path = await client.download_media(
                    event.message,
                    file=str(Path(tmpdir) / base_name)
                )

                if saved_path:
                    public_filename = Path(saved_path).name
                    media_object_key = f"telegram-media/{public_filename}"

                    upload_file_to_bucket(saved_path, media_object_key)
                    media_url = f"{BACKEND_BASE_URL}/media/{media_object_key}"

        except Exception as e:
            print("\n[MEDIA UPLOAD ERROR]")
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
        "media_object_key": media_object_key,
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
        print(f"media_object_key: {media_object_key}")
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
    try:
        await client.start()
    except (AuthKeyDuplicatedError, AuthKeyUnregisteredError) as e:
        print("\n" + "=" * 60)
        print("FATAL: Telegram session is invalid or duplicated.")
        print(f"Error: {e}")
        print()
        print("This happens when the same session string is used from")
        print("two different locations simultaneously (e.g. local + Railway).")
        print()
        print("To fix:")
        print("  1. Stop any local instance of the collector")
        print("  2. Re-generate the session string by running:")
        print("       python generate_string_session.py")
        print("  3. Update TELEGRAM_STRING_SESSION in Railway env vars")
        print("  4. Redeploy")
        print("=" * 60 + "\n")
        # Exit with code 1 so Railway marks the deploy as failed
        # rather than crash-looping indefinitely
        import sys
        sys.exit(1)

    print("Telegram collector connected.")
    print(f"Listening on channels: {TARGET_CHANNELS or 'ALL'}")
    await client.run_until_disconnected()


# Wrap in try/except so a duplicated-key error during the sync
# `with client:` context manager is also caught cleanly.
try:
    with client:
        client.loop.run_until_complete(main())
except (AuthKeyDuplicatedError, AuthKeyUnregisteredError) as e:
    print("\n" + "=" * 60)
    print("FATAL: Telegram session is invalid or duplicated.")
    print(f"Error: {e}")
    print()
    print("Re-generate TELEGRAM_STRING_SESSION and redeploy.")
    print("=" * 60 + "\n")
    import sys
    sys.exit(1)
except KeyboardInterrupt:
    print("Collector stopped by user.")