# agent_routes.py
import os, json, asyncio, logging, re, time
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from supabase import create_client

logger = logging.getLogger("agent_routes")

agent_router = APIRouter(prefix="/api/agent")
SESSIONS_DIR = Path("sessions")
SESSIONS_DIR.mkdir(exist_ok=True)

_supabase = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
)

_active_syncs = set()

class SessionRequest(BaseModel): email: str
class SyncRequest(BaseModel):
    email: str
    semester: str = None

def session_path(email: str) -> Path:
    return SESSIONS_DIR / f"{email.replace('@', '_').replace('.', '_')}.json"

def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()

def _safe_int(s) -> int:
    try:
        return int(float(str(s).strip().split("/")[0]))
    except:
        return 0

def _safe_float(s) -> float:
    try:
        return float(str(s).strip().replace("%", "").replace(",", ""))
    except:
        return 0.0

def set_session_status(email: str, status: str, last_synced: str = None):
    payload = {"user_email": email, "status": status, "storage_path": str(session_path(email))}
    if last_synced:
        payload["last_synced"] = last_synced
    try:
        _supabase.table("portal_sessions").upsert(payload, on_conflict="user_email").execute()
    except Exception as e:
        logger.error(f"[sync] DB Update Failed: {e}")

@agent_router.post("/init-session")
async def init_session(req: SessionRequest):
    asyncio.create_task(_trigger_sync_safely(req.email))
    return {"status": "started", "message": "Browser opening for first-time login"}

@agent_router.post("/sync-user")
async def sync_user(req: SyncRequest):
    asyncio.create_task(_trigger_sync_safely(req.email, req.semester))
    return {"status": "syncing", "message": f"Background sync started for {req.email}"}

async def _trigger_sync_safely(email: str, semester: str = None):
    if email in _active_syncs:
        logger.info(f"[sync] Sync already running for {email}. Ignoring.")
        return
    _active_syncs.add(email)
    try:
        await _sync_user_data(email, semester)
    finally:
        _active_syncs.discard(email)

# =============================================================================
# MASTER PIPELINE
# =============================================================================
async def _sync_user_data(email: str, target_semester: str = None):
    from playwright.async_api import async_playwright
    portal_url = os.getenv("PORTAL_URL", "https://maheslcmtech.manipal.edu")
    spath = session_path(email)
    logger.info(f"[sync] ── Starting sync for {email} ──")
    set_session_status(email, "pending")

    async with async_playwright() as pw:
        browser = None
        try:
            if not spath.exists():
                ok = await _do_headed_login(pw, portal_url, spath, email)
                if not ok:
                    set_session_status(email, "needs_reauth")
                    return
            else:
                browser = await pw.chromium.launch(headless=True)
                ctx = await browser.new_context(storage_state=str(spath))
                page = await ctx.new_page()
                await page.goto(portal_url, wait_until="domcontentloaded", timeout=45_000)
                await asyncio.sleep(4)

                if not await _check_logged_in(page):
                    logger.warning(f"[sync] Session expired for {email}")
                    set_session_status(email, "expired")
                    await browser.close()
                    browser = None
                    ok = await _do_headed_login(pw, portal_url, spath, email)
                    if not ok:
                        set_session_status(email, "needs_reauth")
                        return

            if not browser:
                browser = await pw.chromium.launch(headless=True)
                ctx = await browser.new_context(storage_state=str(spath))
                page = await ctx.new_page()

            attendance = await _scrape_attendance(page, portal_url)
            if attendance:
                _cache_data(email, "attendance", attendance)
                _write_attendance_cache(email, attendance)
                logger.info(f"[sync] Attendance: {len(attendance)} records")

            profile = await _scrape_profile(page, portal_url)
            if profile:
                _cache_data(email, "profile", profile)
                logger.info(f"[sync] Profile: {profile.get('name', '?')}")

            schedule = await _scrape_schedule(page, portal_url)
            if schedule:
                _cache_data(email, "schedule", schedule)
                logger.info(f"[sync] Schedule: {len(schedule)} slots")

            academics = await _scrape_academics(page, portal_url, target_semester)
            if academics:
                _cache_data(email, "academics", academics)
                _write_marks_table(email, academics)
                logger.info(f"[sync] Academics mapped successfully.")

            await ctx.storage_state(path=str(spath))

        except Exception as e:
            logger.error(f"[sync] Critical failure for {email}: {e}", exc_info=True)
        finally:
            if browser:
                await browser.close()
            synced_at = _now()
            set_session_status(email, "active", last_synced=synced_at)
            logger.info(f"[sync] ── Sync complete for {email} ──")
            try:
                _supabase.table("sync_events").insert({
                    "user_email": email, "event": "sync_complete", "created_at": synced_at
                }).execute()
            except Exception:
                pass

async def _do_headed_login(pw, portal_url: str, spath: Path, email: str) -> bool:
    logger.info(f"\n{'='*60}\n🚨 PORTAL LOGIN REQUIRED FOR: {email}\n{'='*60}\n")
    browser = await pw.chromium.launch(headless=False, slow_mo=80)
    ctx = await browser.new_context()
    page = await ctx.new_page()
    try:
        await page.goto(portal_url, wait_until="domcontentloaded", timeout=45_000)
        deadline = time.time() + 300
        logged_in = False
        while time.time() < deadline:
            await asyncio.sleep(2)
            try:
                if await _check_logged_in(page):
                    logged_in = True
                    break
            except Exception:
                pass
        if logged_in:
            await asyncio.sleep(3)
            await ctx.storage_state(path=str(spath))
            logger.info(f"[login] ✅ Session saved for {email}")
        return logged_in
    except Exception as e:
        logger.error(f"[login] Failed: {e}")
        return False
    finally:
        await browser.close()

async def _check_logged_in(page) -> bool:
    try:
        if "/s/" in page.url.lower():
            return True
        el = await page.query_selector("lightning-icon, a:has-text('Log Out'), .slds-global-header")
        return el is not None
    except Exception:
        return False

# =============================================================================
# WORKFLOW ENGINE
# =============================================================================
async def get_workflow(action_name: str) -> dict | None:
    try:
        result = _supabase.table("agent_workflows").select("*") \
            .eq("action_name", action_name) \
            .order("created_at", desc=True) \
            .limit(1).execute()
        return result.data[0] if result.data else None
    except Exception:
        return None

async def run_workflow(page, steps: list, max_retries: int = 3) -> bool:
    for step in steps:
        success = False
        for attempt in range(1, max_retries + 1):
            try:
                t = step.get("type", "")
                if t == "click":
                    success = await _safe_click(page, step.get("labels", []))
                elif t == "wait":
                    success = await _safe_wait(page, step.get("text", ""), timeout=step.get("timeout", 10_000))
                elif t == "navigate":
                    await page.goto(step["url"], wait_until="domcontentloaded", timeout=15_000)
                    success = True
                if success:
                    break
            except Exception:
                if attempt < max_retries:
                    await asyncio.sleep(attempt)
                else:
                    return False
        await asyncio.sleep(0.4)
    return True

async def _safe_click(page, labels: list, timeout: int = 6_000) -> bool:
    for label in labels:
        for fn in [
            lambda l=label: page.get_by_role("button", name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_role("link",   name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_role("tab",    name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_text(re.compile(l, re.I)).first.click(timeout=timeout),
        ]:
            try:
                await fn()
                return True
            except Exception:
                pass
    return False

async def _safe_wait(page, text: str, timeout: int = 10_000) -> bool:
    try:
        await page.wait_for_selector(f"text={text}", timeout=timeout)
        return True
    except Exception:
        return False

# =============================================================================
# TAB HELPERS
# =============================================================================

async def _click_tab(page, tab_name: str) -> bool:
    strategies = [
        lambda n=tab_name: page.locator(f"span[title='{n}']").first.click(timeout=3_000),
        lambda n=tab_name: page.locator(f"a:has(span[title='{n}'])").first.click(timeout=3_000),
        lambda n=tab_name: page.locator(f"li:has(span[title='{n}'])").first.click(timeout=3_000),
        lambda n=tab_name: page.locator(f"[title='{n}']").first.click(timeout=3_000),
        lambda n=tab_name: page.get_by_text(n, exact=True).first.click(timeout=3_000),
    ]
    for i, strategy in enumerate(strategies):
        try:
            await strategy()
            logger.info(f"[tab] ✅ Clicked '{tab_name}' via strategy {i + 1}")
            return True
        except Exception:
            continue
    logger.warning(f"[tab] ❌ Could not click '{tab_name}'")
    return False

async def _wait_for_table_render(page, timeout: int = 8_000) -> None:
    try:
        await page.wait_for_selector("[data-label]", state="visible", timeout=timeout)
        await asyncio.sleep(2)
    except Exception:
        logger.warning("[tab] wait_for_selector timed out — using sleep fallback")
        await asyncio.sleep(5)

async def _get_visible_tab_titles(page) -> list:
    titles = []
    try:
        spans = await page.locator("span[title]").all()
        for sp in spans:
            try:
                if await sp.is_visible():
                    t = (await sp.get_attribute("title") or "").strip()
                    if t: titles.append(t)
            except Exception: pass
    except Exception: pass
    return titles

# =============================================================================
# SCRAPERS
# =============================================================================

async def _scrape_attendance(page, base_url: str) -> list:
    try:
        clean_base = base_url.rstrip('/')
        if clean_base.endswith('/s'):
            clean_base = clean_base[:-2]

        target_url = f"{clean_base}/s/attendance"
        logger.info(f"[scrape_att] 🌐 Navigating to: {target_url}")

        await page.goto(target_url)
        await page.reload()

        logger.info("[scrape_att] ⏳ Waiting 10s for Salesforce DOM...")
        await asyncio.sleep(10)

        empty_loc = page.get_by_text("No data found", exact=False).first
        if await empty_loc.is_visible():
            logger.info("[scrape_att] ⚠️ No data found.")
            return []

        cells = await page.locator("[data-label]").all()
        logger.info(f"[scrape_att] Found {len(cells)} cells.")

        results = {}
        current_subject = None

        for cell in cells:
            label = (await cell.get_attribute("data-label") or "").strip().lower()
            text  = (await cell.inner_text() or "").strip()
            if not label or not text:
                continue

            if "course" in label or "subject" in label:
                current_subject = text
                if current_subject not in results:
                    if " : " in text:
                        parts = text.split(" : ", 1)
                        code = parts[0].strip()
                        raw_name = parts[1].strip()
                        clean_name = re.sub(r'\s*' + re.escape(code) + r'\s*$', '', raw_name).strip()
                        results[current_subject] = {"code": code, "name": clean_name.title()}
                    else:
                        results[current_subject] = {"code": text.strip(), "name": text.strip().title()}

            elif current_subject:
                if "total" in label:
                    results[current_subject]["total"] = _safe_int(text)
                elif "present" in label or "attended" in label:
                    results[current_subject]["attended"] = _safe_int(text)
                elif "percentage" in label or "%" in label:
                    val = _safe_float(text)
                    results[current_subject]["percent"] = val
                    results[current_subject]["safe"]    = val >= 75.0

        final_data = [r for r in results.values() if "total" in r and "attended" in r]
        logger.info(f"[scrape_att] ✅ Extracted {len(final_data)} subjects!")
        return final_data

    except Exception as e:
        logger.error(f"[scrape_att] ❌ Failed: {e}")
        return []

async def _scrape_academics(page, base_url: str, target_semester: str = None) -> dict:
    result = {
        "cgpa": None, "gpa": None,
        "credits_earned": None, "total_credits": None,
        "enrolled": [], "internal_results": [], "final_results": [],
    }
    master_results = {}  # Store everything here by course_code

    def _clean_label(raw: str) -> str:
        c = re.sub(r'[\u200b\u200c\u200d\ufeff\xa0\t]', ' ', raw)
        return re.sub(r'\s+', ' ', c).strip().lower()

    def _clean_text(raw: str) -> str:
        c = re.sub(r'[\u200b\u200c\u200d\ufeff\xa0\t]', ' ', raw)
        return re.sub(r'\s+', ' ', c).strip()

    def _parse_name(txt: str, code: str) -> str:
        name_part = txt
        if " : " in txt: name_part = txt.split(" : ", 1)[-1]
        elif ":" in txt: name_part = txt.split(":", 1)[-1]
        elif " - " in txt: name_part = txt.split(" - ", 1)[-1]
        
        name_part = re.sub(r'\s*' + re.escape(code) + r'\s*$', '', name_part).strip()
        name_part = re.sub(r'\s+[A-Z]{2,5}\s*\d{4}\s*$', '', name_part).strip()
        return name_part.title() if name_part else code

    async def _scrape_grid(sem: str, tab_name: str):
        """Scrapes whatever grid is currently visible and merges into master_results"""
        cells = await page.locator("[data-label]").all()
        current_code = None

        for cell in cells:
            try:
                if not await cell.is_visible():
                    bbox = await cell.bounding_box()
                    if not (bbox and bbox["width"] > 0): continue
                raw_lbl = await cell.get_attribute("data-label") or ""
                raw_txt = await cell.inner_text() or ""
            except Exception:
                continue

            lbl = _clean_label(raw_lbl)
            txt = _clean_text(raw_txt)
            if not lbl or not txt: continue

            # Anchor on Course Code
            if "code" in lbl and ("course" in lbl or "subject" in lbl) or lbl == "code":
                current_code = txt.strip()
                if current_code not in master_results:
                    master_results[current_code] = {"code": current_code, "name": current_code, "semester": sem}
                continue

            if not current_code: continue
            r = master_results[current_code]

            # Merge Data
            if "name" in lbl and ("course" in lbl or "subject" in lbl):
                r["name"] = _parse_name(txt, current_code)
            elif re.search(r'\bca\b', lbl) and "marks" in lbl: r["ca_marks"] = _safe_float(txt)
            elif re.search(r'\bmta\b', lbl): r["mta_marks"] = _safe_float(txt)
            elif "attendance" in lbl: r["attendance_pct"] = _safe_float(txt)
            elif "credit" in lbl: r["credits"] = _safe_float(txt)
            elif "internal" in lbl and "marks" in lbl: r["internal_marks"] = _safe_float(txt)
            elif "grade" in lbl: r["grade"] = txt

    try:
        clean_base = base_url.rstrip('/')
        if clean_base.endswith('/s'): clean_base = clean_base[:-2]
        target_url = f"{clean_base}/s/academics"
        
        logger.info(f"[scrape_acad] 🌐 Navigating to: {target_url}")
        await page.goto(target_url, wait_until="domcontentloaded", timeout=45_000)
        await page.reload()
        logger.info("[scrape_acad] ⏳ Waiting 6s for page to settle...")
        await asyncio.sleep(6)

        # =====================================================================
        # FLOW PART 1: INTERNAL RESULT TAB (CA/MTA Marks)
        # =====================================================================
        try:
            logger.info("[scrape_acad] 🟡 Clicking 'Internal Result' Tab...")
            await page.get_by_text("Internal Result", exact=True).first.click(timeout=5000)
            await asyncio.sleep(4)

            # 🚨 FIX: Explicitly target the VISIBLE button
            btn = page.locator("lightning-combobox button:visible").first
            await btn.click()
            await asyncio.sleep(1)
            
            opts = await page.locator("lightning-base-combobox-item:visible").all_inner_texts() 
            sems = [o.strip() for o in opts if o.strip() and o.strip() != "All"]
            sems = list(dict.fromkeys(sems)) # This instantly deletes all duplicates!
            await btn.click() 
            
            logger.info(f"[scrape_acad] Internal Result Semesters: {sems}")

            for sem in sems:
                if target_semester and target_semester.lower() not in sem.lower(): continue
                logger.info(f"[scrape_acad] 🟡 Internal Result -> Extracting: {sem}")
                
                await btn.click()
                await asyncio.sleep(1)
                await page.locator("lightning-base-combobox-item").filter(has_text=re.compile(f"^{re.escape(sem)}$", re.I)).first.click()
                await asyncio.sleep(4) 
                
                await _scrape_grid(sem, "Internal Result")

        except Exception as e:
            logger.warning(f"[scrape_acad] Failed on Internal Result flow: {e}")

        # =====================================================================
        # FLOW PART 2: RESULT TAB (Endsem Marks / Grades / CGPA)
        # =====================================================================
        try:
            logger.info("[scrape_acad] 🟢 Clicking 'Result' Tab...")
            await page.get_by_text("Result", exact=True).first.click(timeout=5000)
            await asyncio.sleep(4)

            # 🚨 FIX: Explicitly target the VISIBLE button
            btn = page.locator("lightning-combobox button:visible").first
            await btn.click()
            await asyncio.sleep(1)
            
            opts = await page.locator("lightning-base-combobox-item").all_inner_texts()
            sems = list(dict.fromkeys(sems)) # This instantly deletes all duplicates!
            sems = [o.strip() for o in opts if o.strip() and o.strip() != "All"]
            await btn.click() 
            
            logger.info(f"[scrape_acad] Result Semesters: {sems}")

            for sem in sems:
                if target_semester and target_semester.lower() not in sem.lower(): continue
                logger.info(f"[scrape_acad] 🟢 Result -> Extracting: {sem}")
                
                await btn.click()
                await asyncio.sleep(1)
                await page.locator("lightning-base-combobox-item:visible").filter(has_text=re.compile(f"^{re.escape(sem)}$", re.I)).first.click() 
                await asyncio.sleep(4)
                
                await _scrape_grid(sem, "Result")

                # CGPA Extraction
                if result["cgpa"] is None:
                    try:
                        b_tags = await page.locator("b").all()
                        for b in b_tags:
                            if not await b.is_visible(): continue
                            bt = _clean_text(await b.inner_text() or "")
                            if "CGPA" in bt:
                                p = page.locator("p").filter(has=b)
                                if await p.count() > 0:
                                    m = re.search(r"CGPA\s*[:\-]?\s*([\d.]+)", " ".join((await p.first.inner_text() or "").split()), re.I)
                                    if m: 
                                        result["cgpa"] = float(m.group(1))
                                        logger.info(f"[scrape_acad] 🎯 CGPA found: {result['cgpa']}")
                    except Exception: pass

        except Exception as e:
            logger.warning(f"[scrape_acad] Failed on Result flow: {e}")

        for row in master_results.values():
            result["final_results"].append(row)

    except Exception as e:
        logger.error(f"[scrape_acad] ❌ Critical failure: {e}", exc_info=True)

    logger.info(f"[scrape_acad] 🏁 Complete — {len(result['final_results'])} rows extracted.")
    return result


async def _scrape_schedule(page, base_url: str) -> list:
    events_data = []
    try:
        workflow = await get_workflow("schedule")
        if workflow and workflow.get("steps"):
            ok = await run_workflow(page, workflow["steps"])
            if not ok: await page.goto(f"{base_url}/s/schedule", wait_until="domcontentloaded", timeout=45_000)
        else: await page.goto(f"{base_url}/s/schedule", wait_until="domcontentloaded", timeout=45_000)

        logger.info("[scrape_sched] ⏳ Waiting 10s for schedule to render...")
        await asyncio.sleep(10)

        cells = await page.locator("[data-label]").all()
        logger.info(f"[scrape_sched] Found {len(cells)} data-label cells")

        results = {}
        current_key = None
        for cell in cells:
            try:
                if not await cell.is_visible(): continue
                label = (await cell.get_attribute("data-label") or "").strip().lower()
                text  = (await cell.inner_text() or "").strip()
            except Exception: continue
            if not label or not text: continue

            if any(k in label for k in ["day", "subject", "course", "class"]):
                current_key = text
                if current_key not in results: results[current_key] = {"raw_label": text}
            elif current_key:
                r = results[current_key]
                if any(k in label for k in ["start", "from", "begin", "time"]): r["start_time"] = text
                elif any(k in label for k in ["end", "to", "till"]): r["end_time"] = text
                elif "room" in label or "venue" in label or "hall" in label: r["room"] = text
                elif "type" in label or "mode" in label: r["type"] = text
                elif any(k in label for k in ["subject", "course", "name"]): r["subject_name"] = text

        if results:
            events_data = list(results.values())
        if not events_data:
            rows = await page.locator("tr[role='row']").all()
            for row in rows:
                try:
                    if not await row.is_visible(): continue
                    cells_in_row = await row.locator("td").all()
                    texts = [t for t in [(await c.inner_text() or "").strip() for c in cells_in_row] if t]
                    if len(texts) >= 2: events_data.append({"row_cells": texts})
                except Exception: continue

    except Exception as e: logger.error(f"[scrape_sched] Failed: {e}", exc_info=True)
    return events_data

async def _scrape_profile(page, base_url: str) -> dict:
    return {}

def _cache_data(email: str, data_type: str, data):
    try: _supabase.table("cached_data").upsert({"user_email": email, "type": data_type, "data": json.dumps(data), "updated_at": _now()}, on_conflict="user_email,type").execute()
    except Exception as e: logger.error(f"[cache] Failed: {e}")

def _write_attendance_cache(email: str, records: list):
    try:
        rows = [{"user_email": email, "subject_code": r.get("code", ""), "subject_name": r.get("name", ""), "attended": int(r.get("attended", 0)), "total": int(r.get("total", 0)), "percent": float(r.get("percent", 0)), "safe": bool(r.get("safe", False)), "fetched_at": _now()} for r in records]
        if rows: _supabase.table("attendance_cache").upsert(rows, on_conflict="user_email,subject_code").execute()
    except Exception: pass

def _write_marks_table(email: str, academics: dict):
    rows = []
    now = _now()
    for r in academics.get("final_results", []):
        code = (r.get("code") or "").strip()
        if not code: continue
        score = _safe_float(r.get("internal_marks") or 0)
        ca = _safe_float(r.get("ca_marks") or 0) or None
        mta = _safe_float(r.get("mta_marks") or 0) or None
        rows.append({
            "student_email": email, "subject_code": code, "subject_name": (r.get("name") or "").strip(),
            "exam_type": "final", "semester": (r.get("semester") or "").strip(), "score": score,
            "max_score": 100.0, "grade": (r.get("grade") or "").strip(), "credits": _safe_float(r.get("credits", 0)),
            "ca_marks": ca, "mta_marks": mta, "attendance_pct": _safe_float(r.get("attendance_pct", 0)) or None, "updated_at": now
        })
    try:
        if rows: _supabase.table("marks").upsert(rows, on_conflict="student_email,subject_code,exam_type").execute()
    except Exception as e: logger.error(f"[cache] Failed: {e}")