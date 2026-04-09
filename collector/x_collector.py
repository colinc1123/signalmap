"""
X (Twitter) Collector for SignalThread
=======================================
Polls a list of X/Twitter accounts for new posts and forwards them
to the SignalMap backend API.

Uses the `tweepy` library with the Twitter API v2 (Bearer Token).

Required environment variables:
  SIGNALMAP_API_URL          - backend API base URL
  TWITTER_BEARER_TOKEN       - Twitter API v2 bearer token
  TWITTER_TARGET_ACCOUNTS    - comma-separated list of handles (no @)
                               e.g. "UAWarMapper,IntelCrab,OSINTdefender"
  POLL_INTERVAL_SECONDS      - how often to poll (default: 60)

Optional:
  TWITTER_MAX_RESULTS        - results per account per poll (default: 10, max 100)
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime, timezone, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [X-COLLECTOR] %(levelname)s %(message)s",
)
log = logging.getLogger("x_collector")

# ── config ────────────────────────────────────────────────────────────────────

SIGNALMAP_API_URL = os.getenv("SIGNALMAP_API_URL", "").rstrip("/")
BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN", "")
TARGET_ACCOUNTS_RAW = os.getenv("TWITTER_TARGET_ACCOUNTS", "")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
MAX_RESULTS = min(int(os.getenv("TWITTER_MAX_RESULTS", "10")), 100)

if not SIGNALMAP_API_URL:
    log.error("Missing SIGNALMAP_API_URL")
    sys.exit(1)

if not BEARER_TOKEN:
    log.error("Missing TWITTER_BEARER_TOKEN")
    sys.exit(1)

TARGET_ACCOUNTS: list[str] = [
    a.strip().lstrip("@").lower()
    for a in TARGET_ACCOUNTS_RAW.split(",")
    if a.strip()
]

if not TARGET_ACCOUNTS:
    log.error("No accounts in TWITTER_TARGET_ACCOUNTS")
    sys.exit(1)

log.info(f"Monitoring {len(TARGET_ACCOUNTS)} X accounts: {TARGET_ACCOUNTS}")

TWITTER_API_BASE = "https://api.twitter.com/2"

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "User-Agent": "SignalThreadCollector/1.0",
}

# Track the most recent tweet ID seen per account to avoid duplicates
_since_ids: dict[str, str] = {}

# ── Twitter API helpers ───────────────────────────────────────────────────────

def get_user_id(username: str) -> str | None:
    """Resolve a username to a numeric user ID."""
    url = f"{TWITTER_API_BASE}/users/by/username/{username}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            return r.json().get("data", {}).get("id")
        log.warning(f"Could not resolve user ID for @{username}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.error(f"Error resolving @{username}: {e}")
    return None


def fetch_tweets(user_id: str, username: str) -> list[dict]:
    """
    Fetch recent tweets for a user, returning only new ones since last poll.
    """
    url = f"{TWITTER_API_BASE}/users/{user_id}/tweets"
    params = {
        "max_results": MAX_RESULTS,
        "tweet.fields": "created_at,text,author_id,entities",
        "expansions": "author_id",
        "user.fields": "username,name,verified",
        "exclude": "retweets,replies",
    }

    since_id = _since_ids.get(username)
    if since_id:
        params["since_id"] = since_id

    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=15)
        if r.status_code == 429:
            reset = int(r.headers.get("x-rate-limit-reset", time.time() + 60))
            wait = max(reset - int(time.time()), 5)
            log.warning(f"Rate limited. Sleeping {wait}s")
            time.sleep(wait)
            return []
        if r.status_code != 200:
            log.warning(f"Tweets fetch failed for @{username}: {r.status_code} {r.text[:200]}")
            return []

        data = r.json()
        tweets = data.get("data", [])

        if tweets:
            # Update since_id to the newest tweet's ID
            _since_ids[username] = tweets[0]["id"]

        return tweets

    except Exception as e:
        log.error(f"Error fetching tweets for @{username}: {e}")
        return []


def forward_to_api(tweet: dict, username: str) -> None:
    """POST a tweet to the SignalMap backend."""
    payload = {
        "source_name": f"@{username}",
        "external_message_id": tweet["id"],
        "text": tweet.get("text", ""),
        "has_media": False,
        "media_type": None,
        "media_object_key": None,
        "media_url": None,
        "posted_at": tweet.get("created_at"),
    }

    try:
        r = requests.post(
            f"{SIGNALMAP_API_URL}/messages",
            json=payload,
            timeout=10,
        )
        log.info(
            f"Forwarded tweet {tweet['id']} from @{username} → {r.status_code}"
        )
    except Exception as e:
        log.error(f"Failed to forward tweet {tweet['id']}: {e}")


# ── main loop ─────────────────────────────────────────────────────────────────

_running = True

def handle_shutdown(signum, frame):
    global _running
    log.info("Shutdown signal received")
    _running = False

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)


def main():
    # Resolve all usernames to user IDs on startup
    user_ids: dict[str, str] = {}
    for handle in TARGET_ACCOUNTS:
        uid = get_user_id(handle)
        if uid:
            user_ids[handle] = uid
            log.info(f"Resolved @{handle} → {uid}")
        else:
            log.warning(f"Skipping @{handle} (could not resolve)")

    if not user_ids:
        log.error("No valid accounts to monitor")
        sys.exit(1)

    log.info(f"Starting poll loop (interval={POLL_INTERVAL}s)")

    while _running:
        for handle, uid in user_ids.items():
            if not _running:
                break
            tweets = fetch_tweets(uid, handle)
            if tweets:
                log.info(f"@{handle}: {len(tweets)} new tweet(s)")
                for tweet in tweets:
                    forward_to_api(tweet, handle)
            else:
                log.debug(f"@{handle}: no new tweets")

        # Sleep in small increments so shutdown is responsive
        for _ in range(POLL_INTERVAL):
            if not _running:
                break
            time.sleep(1)

    log.info("X collector stopped")


if __name__ == "__main__":
    main()