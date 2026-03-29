# background_worker.py
import os, asyncio, logging
from datetime import datetime, timezone
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("background_worker")

# ─── TESTING SETTINGS: Run every 1 minute, ignore minimum gaps ───
# ─── PRODUCTION SETTINGS: Run every 3 hours ───
SYNC_INTERVAL_MINUTES = 60
MIN_SYNC_GAP_MINUTES  = 180

def _get_supabase():
    from supabase import create_client
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")))

async def sync_user(email: str, supabase):
    logger.info(f"[worker] Syncing {email}…")
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            # FIXED: 127.0.0.1 prevents Windows localhost routing errors
            async with session.post(
                "http://127.0.0.1:8000/api/agent/sync-user",
                json={"email": email},
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
                result = await resp.json()
                logger.info(f"[worker] {email}: {result.get('message', 'done')}")
    except Exception as e:
        logger.error(f"[worker] Failed to sync {email}: {e}")

async def run_sync_cycle():
    logger.info("═══ Auto-sync cycle starting ═══")
    try:
        supabase = _get_supabase()
        result = supabase.table("portal_sessions").select("user_email, status, last_synced").in_("status", ["active", "expired"]).execute()
        sessions = result.data or []
        logger.info(f"[worker] Found {len(sessions)} users to check")

        now = datetime.now(timezone.utc)
        for sess in sessions:
            email = sess["user_email"]
            last_synced = sess.get("last_synced")

            if last_synced:
                try:
                    ls = datetime.fromisoformat(last_synced.replace("Z", "+00:00"))
                    gap_mins = (now - ls).total_seconds() / 60
                    if gap_mins < MIN_SYNC_GAP_MINUTES:
                        logger.info(f"[worker] Skipping {email} — synced {gap_mins:.1f}m ago")
                        continue
                except Exception: pass

            if sess["status"] == "needs_reauth":
                continue

            await sync_user(email, supabase)
            await asyncio.sleep(2)

        logger.info(f"═══ Sync cycle complete ═══")

    except Exception as e:
        logger.error(f"[worker] Cycle error: {e}")

async def main():
    logger.info(f"Background worker started — testing mode: syncing every {SYNC_INTERVAL_MINUTES}m")
    while True:
        await run_sync_cycle()
        await asyncio.sleep(SYNC_INTERVAL_MINUTES * 60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Background worker stopped.")