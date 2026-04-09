"""
Instagram Collector for SignalThread
======================================
Polls a list of Instagram accounts for new posts and forwards them
to the SignalMap backend API.

Uses the `instagrapi` library (unofficial Instagram private API client).
Requires a real Instagram account for authentication.

Required environment variables:
  SIGNALMAP_API_URL            - backend API base URL
  INSTAGRAM_USERNAME           - your Instagram login username
  INSTAGRAM_PASSWORD           - your Instagram login password
  INSTAGRAM_TARGET_ACCOUNTS    - comma-separated list of IG usernames
                                 e.g. "warzoneintel,mideastconflict,conflictarchive"
  POLL_INTERVAL_SECONDS        - how often to poll (default: 300 — 5 min)
                                 Instagram rate limits are aggressive; keep this high.

Optional:
  INSTAGRAM_MAX_POSTS          - posts to fetch per account per poll (default: 5)
  INSTAGRAM_SESSION_FILE       - path to save/load session (default: ig_session.json)
"""

import os
import sys
import time
import json
import signal
import logging
import tempfile
import mimetypes
from pathlib import Path

import boto3
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [IG-COLLECTOR] %(levelname)s %(message)s",
)
log = logging.getLogger("ig_collector")

# ── config ────────────────────────────────────────────────────────────────────

SIGNALMAP_API_URL = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
IG_USERNAME = os.getenv("INSTAGRAM_USERNAME", "")
IG_PASSWORD = os.getenv("INSTAGRAM_PASSWORD", "")
TARGET_ACCOUNTS_RAW = os.getenv("INSTAGRAM_TARGET_ACCOUNTS", "")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))
MAX_POSTS = int(os.getenv("INSTAGRAM_MAX_POSTS", "5"))
SESSION_FILE = os.getenv("INSTAGRAM_SESSION_FILE", "ig_session.json")

AWS_ENDPOINT_URL = os.getenv("AWS_ENDPOINT_URL")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

if not SIGNALMAP_API_URL:
    log.error("Missing SIGNALMAP_API_URL")
    sys.exit(1)

if not IG_USERNAME or not IG_PASSWORD:
    log.error("Missing INSTAGRAM_USERNAME or INSTAGRAM_PASSWORD")
    sys.exit(1)

TARGET_ACCOUNTS: list[str] = [
    a.strip().lstrip("@").lower()
    for a in TARGET_ACCOUNTS_RAW.split(",")
    if a.strip()
]

if not TARGET_ACCOUNTS:
    log.error("No accounts in INSTAGRAM_TARGET_ACCOUNTS")
    sys.exit(1)

log.info(f"Monitoring {len(TARGET_ACCOUNTS)} Instagram accounts: {TARGET_ACCOUNTS}")

# S3 client (optional — media upload)
_s3 = None
if all([AWS_ENDPOINT_URL, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION,
        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY]):
    _s3 = boto3.client(
        "s3",
        endpoint_url=AWS_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_DEFAULT_REGION,
    )
    log.info("S3 configured for media uploads")
else:
    log.warning("S3 not configured — media will not be uploaded")

# Track the most recent post ID per account
_seen_ids: dict[str, set[str]] = {}

# ── instagrapi client setup ───────────────────────────────────────────────────

def build_client():
    """
    Create and authenticate an instagrapi Client.
    Saves/loads session to avoid repeated logins.
    """
    try:
        from instagrapi import Client
        from instagrapi.exceptions import LoginRequired, TwoFactorRequired
    except ImportError:
        log.error(
            "instagrapi is not installed. Run: pip install instagrapi"
        )
        sys.exit(1)

    cl = Client()
    cl.delay_range = [2, 5]  # polite random delay between requests

    session_path = Path(SESSION_FILE)
    if session_path.exists():
        try:
            cl.load_settings(session_path)
            cl.login(IG_USERNAME, IG_PASSWORD)
            log.info("Logged in from saved session")
            return cl
        except Exception as e:
            log.warning(f"Saved session invalid ({e}), doing fresh login")

    try:
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(session_path)
        log.info("Fresh login successful, session saved")
        return cl
    except TwoFactorRequired:
        code = input("Enter Instagram 2FA code: ").strip()
        cl.login(IG_USERNAME, IG_PASSWORD, verification_code=code)
        cl.dump_settings(session_path)
        log.info("2FA login successful, session saved")
        return cl
    except Exception as e:
        log.error(f"Instagram login failed: {e}")
        sys.exit(1)


# ── media helpers ─────────────────────────────────────────────────────────────

def upload_media(local_path: str, object_key: str) -> str | None:
    """Upload media to S3 and return the backend proxy URL."""
    if not _s3:
        return None
    try:
        content_type, _ = mimetypes.guess_type(local_path)
        extra = {"ContentType": content_type} if content_type else {}
        _s3.upload_file(local_path, AWS_S3_BUCKET_NAME, object_key, ExtraArgs=extra)
        return f"{SIGNALMAP_API_URL}/media/{object_key}"
    except Exception as e:
        log.error(f"S3 upload failed: {e}")
        return None


def download_and_upload_media(cl, media_pk: int, source_name: str, post_id: str) -> tuple[str | None, str | None, str | None]:
    """
    Download post media via instagrapi and upload to S3.
    Returns (media_type, object_key, media_url).
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = cl.photo_download(media_pk, folder=Path(tmpdir))
            if not path or not path.exists():
                # try video
                path = cl.video_download(media_pk, folder=Path(tmpdir))
            if not path or not path.exists():
                return None, None, None

            suffix = path.suffix.lower()
            media_type = "video" if suffix in (".mp4", ".mov", ".avi") else "image"
            safe_source = "".join(c for c in source_name if c.isalnum() or c in "-_").strip() or "ig"
            object_key = f"instagram-media/{safe_source}_{post_id}{suffix}"
            media_url = upload_media(str(path), object_key)
            return media_type, object_key, media_url
    except Exception as e:
        log.warning(f"Media download failed for post {post_id}: {e}")
        return None, None, None


# ── fetch & forward ───────────────────────────────────────────────────────────

def fetch_posts(cl, username: str) -> list[dict]:
    """Fetch recent posts for a username, skipping already-seen ones."""
    try:
        user_id = cl.user_id_from_username(username)
        medias = cl.user_medias(user_id, amount=MAX_POSTS)
    except Exception as e:
        log.error(f"Error fetching posts for @{username}: {e}")
        return []

    seen = _seen_ids.setdefault(username, set())
    new_posts = []

    for m in medias:
        pk = str(m.pk)
        if pk in seen:
            continue
        seen.add(pk)
        new_posts.append(m)

    return new_posts


def forward_post(cl, post, username: str) -> None:
    """Download media (if any) and POST the signal to the backend."""
    post_id = str(post.pk)
    text = post.caption_text or ""
    taken_at = post.taken_at  # datetime

    # Determine media type from instagrapi media type codes
    # 1 = photo, 2 = video, 8 = album/carousel
    raw_media_type = post.media_type
    has_media = raw_media_type in (1, 2, 8)
    media_type_str = None
    object_key = None
    media_url = None

    if has_media and _s3:
        if raw_media_type == 1:
            media_type_str = "image"
        elif raw_media_type == 2:
            media_type_str = "video"
        elif raw_media_type == 8:
            media_type_str = "image"  # use first image of carousel

        try:
            _mt, object_key, media_url = download_and_upload_media(
                cl, post.pk, username, post_id
            )
            if _mt:
                media_type_str = _mt
        except Exception as e:
            log.warning(f"Could not download media for {post_id}: {e}")

    payload = {
        "source_name": username,
        "external_message_id": post_id,
        "text": text,
        "has_media": has_media,
        "media_type": media_type_str,
        "media_object_key": object_key,
        "media_url": media_url,
        "posted_at": taken_at.isoformat() if taken_at else None,
    }

    try:
        r = requests.post(
            f"{SIGNALMAP_API_URL}/messages",
            json=payload,
            timeout=10,
        )
        log.info(f"Forwarded IG post {post_id} from @{username} → {r.status_code}")
    except Exception as e:
        log.error(f"Failed to forward IG post {post_id}: {e}")


# ── main loop ─────────────────────────────────────────────────────────────────

_running = True

def handle_shutdown(signum, frame):
    global _running
    log.info("Shutdown signal received")
    _running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)


def main():
    cl = build_client()

    log.info(f"Starting poll loop (interval={POLL_INTERVAL}s)")

    while _running:
        for username in TARGET_ACCOUNTS:
            if not _running:
                break
            try:
                posts = fetch_posts(cl, username)
                if posts:
                    log.info(f"@{username}: {len(posts)} new post(s)")
                    for post in posts:
                        forward_post(cl, post, username)
                else:
                    log.debug(f"@{username}: no new posts")
            except Exception as e:
                log.error(f"Unhandled error for @{username}: {e}")

        # Sleep with responsive shutdown
        for _ in range(POLL_INTERVAL):
            if not _running:
                break
            time.sleep(1)

    log.info("Instagram collector stopped")


if __name__ == "__main__":
    main()