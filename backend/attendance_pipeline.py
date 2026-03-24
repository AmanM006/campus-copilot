# attendance_pipeline.py  (drop-in replacement / upgrade)
# ─── Real attendance: DB cache first → Playwright fallback → error ────────────
# This replaces the existing attendance_pipeline.py.

import os, json, logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger("attendance_pipeline")

CACHE_TTL_HOURS = 6  # Consider cached data fresh for 6 hours

def _get_supabase():
    from supabase import create_client
    return create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
    )

def _is_fresh(updated_at_iso: str, ttl_hours: int = CACHE_TTL_HOURS) -> bool:
    try:
        updated = datetime.fromisoformat(updated_at_iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - updated) < timedelta(hours=ttl_hours)
    except Exception:
        return False

# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API: get_attendance_for_user(email)
# Called by the FastAPI chat endpoint when a student asks for attendance.
# ─────────────────────────────────────────────────────────────────────────────
async def get_attendance_for_user(user_email: str) -> list:
    """
    Returns attendance records for a student.
    Priority:
      1. Fresh DB cache (attendance_cache table)
      2. cached_data table (populated by background worker)
      3. Trigger sync and return empty (chat will tell user to wait)
    Never raises — returns [] if unavailable.
    """
    supabase = _get_supabase()

    # ── 1. Check attendance_cache (most specific, populated by scraper) ──────
    try:
        result = supabase.table("attendance_cache")\
            .select("*")\
            .eq("user_email", user_email)\
            .execute()
        rows = result.data or []
        if rows:
            # Check freshness of first row
            first = rows[0]
            if _is_fresh(first.get("fetched_at", "")):
                logger.info(f"[pipeline] Cache hit (attendance_cache) for {user_email}: {len(rows)} records")
                return _format_att_cache(rows)
            else:
                logger.info(f"[pipeline] Cache stale for {user_email}, will refresh")
    except Exception as e:
        logger.warning(f"[pipeline] attendance_cache error: {e}")

    # ── 2. Check cached_data table (set by background worker) ────────────────
    try:
        result = supabase.table("cached_data")\
            .select("data, updated_at")\
            .eq("user_email", user_email)\
            .eq("type", "attendance")\
            .single()\
            .execute()
        if result.data:
            if _is_fresh(result.data["updated_at"]):
                records = json.loads(result.data["data"]) if isinstance(result.data["data"], str) else result.data["data"]
                logger.info(f"[pipeline] Cache hit (cached_data) for {user_email}: {len(records)} records")
                return records
    except Exception as e:
        logger.warning(f"[pipeline] cached_data error: {e}")

    # ── 3. No fresh cache — trigger background sync and return empty ──────────
    logger.warning(f"[pipeline] No fresh attendance for {user_email} — triggering sync")
    await _trigger_sync(user_email)
    return []   # Caller (chat) will say "sync in progress, try again soon"

async def _trigger_sync(email: str):
    """Non-blocking: ask the agent server to sync this user."""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            await session.post(
                "http://localhost:8000/api/agent/sync-user",
                json={"email": email},
                timeout=aiohttp.ClientTimeout(total=5),
            )
    except Exception as e:
        logger.debug(f"[pipeline] trigger_sync silently failed: {e}")

def _format_att_cache(rows: list) -> list:
    """Normalise attendance_cache rows → standard format expected by chat."""
    result = []
    for r in rows:
        result.append({
            "code":      r.get("subject_code", ""),
            "name":      r.get("subject_name", ""),
            "attended":  r.get("attended", 0),
            "total":     r.get("total", 0),
            "percent":   float(r.get("percent", 0)),
            "safe":      bool(r.get("safe", False)),
        })
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Helper: write scraped attendance rows back to attendance_cache
# Called by agent_routes._sync_user_data after scraping
# ─────────────────────────────────────────────────────────────────────────────
def write_attendance_cache(email: str, records: list):
    """Upserts freshly-scraped attendance into attendance_cache table."""
    supabase = _get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for r in records:
        rows.append({
            "user_email":   email,
            "subject_code": r.get("code") or r.get("subject", ""),
            "subject_name": r.get("name") or r.get("subject", ""),
            "attended":     int(r.get("attended", 0)),
            "total":        int(r.get("total", 0)),
            "percent":      float(r.get("percent", 0)),
            "safe":         bool(r.get("safe", False)),
            "fetched_at":   now,
        })
    if rows:
        supabase.table("attendance_cache")\
            .upsert(rows, on_conflict="user_email,subject_code")\
            .execute()
        logger.info(f"[pipeline] Wrote {len(rows)} attendance records for {email}")