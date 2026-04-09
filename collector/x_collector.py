"""
X (Twitter) Collector for SignalThread — twikit edition
=========================================================
Uses the `twikit` library which scrapes X via the internal
web/mobile API. No developer account or paid API tier needed.

Auth uses your personal X account cookies (one-time login,
session saved to disk and reused).

Required environment variables:
  SIGNALMAP_API_URL          - backend API base URL
  TWITTER_USERNAME           - your X login username or email
  TWITTER_EMAIL              - your X account email
  TWITTER_PASSWORD           - your X account password
  TWITTER_TARGET_ACCOUNTS    - comma-separated handles (no @)
                               e.g. "UAWarMapper,IntelCrab,OSINTdefender"

Optional:
  POLL_INTERVAL_SECONDS      - how often to poll (default: 120)
  TWITTER_MAX_TWEETS         - tweets to fetch per account per poll (default: 20)
  TWITTER_COOKIES_FILE       - path to save session cookies (default: x_cookies.json)
"""

import os
import sys
import time
import json
import signal
import asyncio
import logging
from pathlib import Path
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [X-COLLECTOR] %(levelname)s %(message)s",
)
log = logging.getLogger("x_collector")

# ── config ────────────────────────────────────────────────────────────────────

SIGNALMAP_API_URL   = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
TWITTER_USERNAME    = os.getenv("TWITTER_USERNAME", "")
TWITTER_EMAIL       = os.getenv("TWITTER_EMAIL", "")
TWITTER_PASSWORD    = os.getenv("TWITTER_PASSWORD", "")
TARGET_ACCOUNTS_RAW = os.getenv("TWITTER_TARGET_ACCOUNTS", "")
POLL_INTERVAL       = int(os.getenv("POLL_INTERVAL_SECONDS", "120"))
MAX_TWEETS          = int(os.getenv("TWITTER_MAX_TWEETS", "20"))
COOKIES_FILE        = os.getenv("TWITTER_COOKIES_FILE", "x_cookies.json")

if not SIGNALMAP_API_URL:
    log.error("Missing SIGNALMAP_API_URL"); sys.exit(1)
if not TWITTER_USERNAME or not TWITTER_PASSWORD:
    log.error("Missing TWITTER_USERNAME or TWITTER_PASSWORD"); sys.exit(1)

TARGET_ACCOUNTS: list[str] = [
    a.strip().lstrip("@").lower()
    for a in TARGET_ACCOUNTS_RAW.split(",")
    if a.strip()
]

if not TARGET_ACCOUNTS:
    log.error("No accounts in TWITTER_TARGET_ACCOUNTS"); sys.exit(1)

log.info(f"Monitoring {len(TARGET_ACCOUNTS)} X accounts: {TARGET_ACCOUNTS}")

# Track newest tweet ID per account to avoid duplicates
_since_ids: dict[str, str] = {}

# ── twikit client ─────────────────────────────────────────────────────────────

async def build_client():
    """Login or load saved cookies, return authenticated twikit Client."""
    try:
        from twikit import Client
    except ImportError:
        log.error("twikit is not installed. Run: pip install twikit")
        sys.exit(1)

    client = Client("en-US")
    cookies_path = Path(COOKIES_FILE)

    if cookies_path.exists():
        try:
            client.load_cookies(str(cookies_path))
            log.info("Loaded X session from saved cookies")
            return client
        except Exception as e:
            log.warning(f"Failed to load cookies ({e}), doing fresh login")

    log.info(f"Logging in to X as {TWITTER_USERNAME}...")
    try:
        await client.login(
            auth_info_1=TWITTER_USERNAME,
            auth_info_2=TWITTER_EMAIL,
            password=TWITTER_PASSWORD,
        )
        client.save_cookies(str(cookies_path))
        log.info("Login successful, cookies saved")
        return client
    except Exception as e:
        log.error(f"X login failed: {e}")
        sys.exit(1)


# ── fetch & forward ───────────────────────────────────────────────────────────

async def fetch_tweets(client, username: str) -> list:
    """Fetch recent tweets for a user."""
    try:
        user = await client.get_user_by_screen_name(username)
        tweets = await user.get_tweets("Tweets", count=MAX_TWEETS)
        return list(tweets) if tweets else []
    except Exception as e:
        log.error(f"Error fetching tweets for @{username}: {e}")
        return []


def forward_tweet(tweet, username: str) -> None:
    """POST a tweet to the SignalMap backend."""
    tweet_id = str(tweet.id)
    text = getattr(tweet, "text", "") or ""

    # Skip retweets
    if text.startswith("RT @"):
        return

    created_at = None
    try:
        created_at = datetime.strptime(
            tweet.created_at, "%a %b %d %H:%M:%S +0000 %Y"
        ).isoformat() + "Z"
    except Exception:
        pass

    payload = {
        "source_name": f"@{username}",
        "external_message_id": tweet_id,
        "text": text,
        "has_media": False,
        "media_type": None,
        "media_object_key": None,
        "media_url": None,
        "posted_at": created_at,
    }

    try:
        r = requests.post(
            f"{SIGNALMAP_API_URL}/messages",
            json=payload,
            timeout=10,
        )
        log.info(f"Forwarded tweet {tweet_id} from @{username} → {r.status_code}")
    except Exception as e:
        log.error(f"Failed to forward tweet {tweet_id}: {e}")


# ── main loop ─────────────────────────────────────────────────────────────────

_running = True

def handle_shutdown(signum, frame):
    global _running
    log.info("Shutdown signal received")
    _running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)


async def poll_loop(client) -> None:
    log.info(f"Starting poll loop (interval={POLL_INTERVAL}s)")

    while _running:
        for username in TARGET_ACCOUNTS:
            if not _running:
                break
            try:
                tweets = await fetch_tweets(client, username)
                new_count = 0

                if tweets:
                    newest_id = str(tweets[0].id)
                    since = _since_ids.get(username)

                    for tweet in tweets:
                        tweet_id = str(tweet.id)
                        # Skip already seen tweets
                        if since and tweet_id <= since:
                            continue
                        forward_tweet(tweet, username)
                        new_count += 1

                    _since_ids[username] = newest_id

                log.info(f"@{username}: {new_count} new tweet(s)")

            except Exception as e:
                log.error(f"Unhandled error for @{username}: {e}")

            # Small gap between accounts
            await asyncio.sleep(3)

        for _ in range(POLL_INTERVAL):
            if not _running:
                break
            await asyncio.sleep(1)


async def main():
    client = await build_client()
    await poll_loop(client)
    log.info("X collector stopped")


if __name__ == "__main__":
    asyncio.run(main())