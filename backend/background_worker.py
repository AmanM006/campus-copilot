# background_worker.py
# ─── Background sync worker: runs every 6 hours for all active users ──────────
# Usage: python background_worker.py   (run as a separate process alongside main.py)

import os, json, asyncio, logging, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("background_worker")

SYNC_INTERVAL_HOURS = 6
MIN_SYNC_GAP_HOURS  = 5   # Don't re-sync a user synced less than 5h ago

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def _get_supabase():
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
    if not url or not key:
        raise ValueError("Supabase URL/KEY not configured")
    return create_client(url, key)

# ─────────────────────────────────────────────────────────────────────────────
# Core: sync one user
# ─────────────────────────────────────────────────────────────────────────────
async def sync_user(email: str, supabase):
    """Full sync pipeline for one user. Calls existing _sync_user_data logic."""
    logger.info(f"[worker] Syncing {email}…")
    try:
        # Reuse the sync logic from agent_routes via HTTP call to local FastAPI
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost:8000/api/agent/sync-user",
                json={"email": email},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                result = await resp.json()
                logger.info(f"[worker] {email}: {result.get('message', 'done')}")
    except Exception as e:
        logger.error(f"[worker] Failed to sync {email}: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Core: run one full sync cycle for all users
# ─────────────────────────────────────────────────────────────────────────────
async def run_sync_cycle():
    logger.info("═══ Auto-sync cycle starting ═══")
    try:
        supabase = _get_supabase()

        # Fetch all users with active/expired sessions
        result = supabase.table("portal_sessions")\
            .select("user_email, status, last_synced")\
            .in_("status", ["active", "expired"])\
            .execute()

        sessions = result.data or []
        logger.info(f"[worker] Found {len(sessions)} users to check")

        now = datetime.now(timezone.utc)
        synced_count = 0

        for sess in sessions:
            email       = sess["user_email"]
            status      = sess["status"]
            last_synced = sess.get("last_synced")

            # Skip if synced recently (respect MIN_SYNC_GAP_HOURS)
            if last_synced:
                try:
                    ls = datetime.fromisoformat(last_synced.replace("Z", "+00:00"))
                    gap = (now - ls).total_seconds() / 3600
                    if gap < MIN_SYNC_GAP_HOURS:
                        logger.info(f"[worker] Skipping {email} — synced {gap:.1f}h ago")
                        continue
                except Exception:
                    pass

            # Skip users that need manual reauth
            if status == "needs_reauth":
                logger.info(f"[worker] Skipping {email} — needs_reauth")
                continue

            await sync_user(email, supabase)
            synced_count += 1

            # Small delay between users to avoid hammering portal
            await asyncio.sleep(5)

        logger.info(f"═══ Sync cycle complete — {synced_count} users synced ═══")

    except Exception as e:
        logger.error(f"[worker] Cycle error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Main loop: run every SYNC_INTERVAL_HOURS
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    logger.info(f"Background worker started — syncing every {SYNC_INTERVAL_HOURS}h")

    while True:
        await run_sync_cycle()

        next_run = datetime.now() + timedelta(hours=SYNC_INTERVAL_HOURS)
        logger.info(f"[worker] Next sync at {next_run.strftime('%H:%M:%S')}")

        # Sleep in 60s chunks so we can catch KeyboardInterrupt cleanly
        for _ in range(SYNC_INTERVAL_HOURS * 60):
            await asyncio.sleep(60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Background worker stopped.")