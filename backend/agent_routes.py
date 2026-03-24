# agent_routes.py
# ─── Playwright session management + full scraping pipeline ───────────────────
# Mount in main.py:
#   from agent_routes import agent_router
#   app.include_router(agent_router)

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

# ─── Pydantic models ──────────────────────────────────────────────────────────
class SessionRequest(BaseModel):
    email: str

class SyncRequest(BaseModel):
    email: str

# ─── Session path ─────────────────────────────────────────────────────────────
def session_path(email: str) -> Path:
    safe = email.replace("@", "_").replace(".", "_")
    return SESSIONS_DIR / f"{safe}.json"

def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()

def set_session_status(email: str, status: str, last_synced: str = None):
    """
    Only writes columns that exist: user_email, status, storage_path, last_synced.
    No last_validated or updated_at — those don't exist and cause PGRST/42703.
    """
    payload = {
        "user_email":   email,
        "status":       status,
        "storage_path": str(session_path(email)),
    }
    if last_synced:
        payload["last_synced"] = last_synced
    _supabase.table("portal_sessions") \
        .upsert(payload, on_conflict="user_email") \
        .execute()

# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────
@agent_router.post("/init-session")
async def init_session(req: SessionRequest):
    asyncio.create_task(_sync_user_data(req.email))
    return {"status": "started", "message": "Browser opening for first-time login"}

@agent_router.post("/sync-user")
async def sync_user(req: SyncRequest):
    asyncio.create_task(_sync_user_data(req.email))
    return {"status": "syncing", "message": f"Background sync started for {req.email}"}


# ─────────────────────────────────────────────────────────────────────────────
# MASTER PIPELINE  ─  flat, no recursion
# ─────────────────────────────────────────────────────────────────────────────
async def _sync_user_data(email: str):
    from playwright.async_api import async_playwright

    portal_url = os.getenv("PORTAL_URL", "https://maheslcmtech.manipal.edu")
    spath      = session_path(email)

    logger.info(f"[sync] ── Starting sync for {email} ──")
    set_session_status(email, "pending")

    async with async_playwright() as pw:

        # ── No session file → headed login ────────────────────────────────────
        if not spath.exists():
            logger.info(f"[sync] No session — opening headed browser for {email}")
            ok = await _do_headed_login(pw, portal_url, spath, email)
            if not ok:
                set_session_status(email, "needs_reauth")
                return

        # ── Session file exists → validate headless ───────────────────────────
        else:
            browser = await pw.chromium.launch(headless=True)
            ctx     = await browser.new_context(storage_state=str(spath))
            page    = await ctx.new_page()
            await page.goto(portal_url, wait_until="domcontentloaded", timeout=45_000)
            logged_in = await _check_logged_in(page)
            await browser.close()

            if not logged_in:
                logger.warning(f"[sync] Session expired — re-login for {email}")
                set_session_status(email, "expired")
                ok = await _do_headed_login(pw, portal_url, spath, email)
                if not ok:
                    set_session_status(email, "needs_reauth")
                    return

        # ── Scrape all data with a fresh headless session ─────────────────────
        browser = await pw.chromium.launch(headless=True)
        ctx     = await browser.new_context(storage_state=str(spath))
        page    = await ctx.new_page()

        try:
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

            academics = await _scrape_academics(page, portal_url)
            if academics:
                _cache_data(email, "academics", academics)
                logger.info(f"[sync] Academics: cgpa={academics.get('cgpa')}, "
                            f"internal={len(academics.get('internal_results', []))}")

            # Refresh cookies
            await ctx.storage_state(path=str(spath))

        finally:
            await browser.close()

    synced_at = _now()
    set_session_status(email, "active", last_synced=synced_at)
    logger.info(f"[sync] ── Sync complete for {email} ──")

    try:
        _supabase.table("sync_events").insert({
            "user_email": email,
            "event":      "sync_complete",
            "created_at": synced_at,
        }).execute()
    except Exception as e:
        logger.warning(f"[sync] sync_events insert failed (non-fatal): {e}")


# ─────────────────────────────────────────────────────────────────────────────
# HEADED LOGIN  (opens browser, waits for user, saves cookies)
# ─────────────────────────────────────────────────────────────────────────────
async def _do_headed_login(pw, portal_url: str, spath: Path, email: str) -> bool:
    browser = await pw.chromium.launch(headless=False, slow_mo=80)
    ctx     = await browser.new_context()
    page    = await ctx.new_page()
    await page.goto(portal_url, wait_until="domcontentloaded", timeout=45_000)
    logger.info(f"[login] Waiting for manual login (5 min) for {email}…")

    deadline  = time.time() + 300
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
        await ctx.storage_state(path=str(spath))
        logger.info(f"[login] Session saved for {email}")
    else:
        logger.warning(f"[login] Timed out for {email}")

    await browser.close()
    return logged_in


# ─────────────────────────────────────────────────────────────────────────────
# SESSION CHECK
# ─────────────────────────────────────────────────────────────────────────────
async def _check_logged_in(page) -> bool:
    try:
        if "/s/" in page.url.lower():
            return True
        el = await page.query_selector(
            "lightning-icon, a:has-text('Log Out'), .slds-global-header"
        )
        return el is not None
    except Exception:
        return False


# ═════════════════════════════════════════════════════════════════════════════
# DYNAMIC WORKFLOW ENGINE
# Loads steps from Supabase agent_workflows table and executes them.
# Falls back to hardcoded navigation if no workflow found.
# ═════════════════════════════════════════════════════════════════════════════

async def get_workflow(action_name: str) -> dict | None:
    """Fetch workflow JSON from Supabase. Returns None if not found."""
    try:
        # Removed maybe_single() to prevent NoneType crashes
        result = _supabase.table("agent_workflows") \
            .select("*") \
            .eq("action_name", action_name) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        
        return result.data[0] if result.data else None
    except Exception as e:
        logger.warning(f"[workflow] get_workflow({action_name}) failed: {e}")
        return None


async def run_workflow(page, steps: list, max_retries: int = 3) -> bool:
    """
    Execute a list of workflow step dicts.
    Step schema matches the JS navigationAgent:
      { type: "click",    labels: [...] }
      { type: "wait",     text: "..." }
      { type: "type",     labels: [...], value: "..." }
      { type: "navigate", url: "..." }
      { type: "wait_nav", timeout: 5000 }
    Returns True if all steps succeeded, False otherwise.
    """
    for i, step in enumerate(steps):
        success = False
        for attempt in range(1, max_retries + 1):
            try:
                t = step.get("type", "")
                if t == "click":
                    success = await _safe_click(page, step.get("labels", []))
                elif t == "wait":
                    success = await _safe_wait(page, step.get("text", ""),
                                               timeout=step.get("timeout", 10_000))
                elif t == "type":
                    success = await _safe_type(page, step.get("labels", []),
                                               step.get("value", ""))
                elif t == "navigate":
                    await page.goto(step["url"], wait_until="domcontentloaded", timeout=15_000)
                    success = True
                elif t == "wait_nav":
                    try:
                        await page.wait_for_load_state(
                            "networkidle", timeout=step.get("timeout", 8_000)
                        )
                    except Exception:
                        await page.wait_for_timeout(step.get("timeout", 1_000))
                    success = True

                if success:
                    break

            except Exception as err:
                if attempt < max_retries:
                    logger.warning(
                        f"[workflow] Step {i+1} attempt {attempt} failed: {err} — retrying"
                    )
                    await asyncio.sleep(attempt)
                else:
                    logger.error(f"[workflow] Step {i+1} failed after {max_retries} attempts")
                    return False

        await asyncio.sleep(0.4)   # brief pause between steps

    return True


async def _safe_click(page, labels: list, timeout: int = 6_000) -> bool:
    for label in labels:
        strategies = [
            lambda l=label: page.get_by_role("button", name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_role("link",   name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_role("tab",    name=re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.get_by_text(re.compile(l, re.I)).first.click(timeout=timeout),
            lambda l=label: page.locator(f"a:has-text('{l}')").first.click(timeout=3_000),
            lambda l=label: page.locator(f"button:has-text('{l}')").first.click(timeout=3_000),
            lambda l=label: page.locator(f"[title*='{l}' i]").first.click(timeout=3_000),
        ]
        for fn in strategies:
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
        try:
            await page.wait_for_load_state("networkidle", timeout=5_000)
            return True
        except Exception:
            return False


async def _safe_type(page, labels: list, value: str, timeout: int = 4_000) -> bool:
    for label in labels:
        strategies = [
            lambda l=label: page.get_by_label(re.compile(l, re.I)).first.fill(value, timeout=timeout),
            lambda l=label: page.get_by_placeholder(re.compile(l, re.I)).first.fill(value, timeout=timeout),
            lambda l=label: page.locator(f"[name='{l}']").first.fill(value, timeout=timeout),
            lambda l=label: page.locator(f"input[type='{l}']").first.fill(value, timeout=timeout),
        ]
        for fn in strategies:
            try:
                await fn()
                return True
            except Exception:
                pass
    return False


# ═════════════════════════════════════════════════════════════════════════════
# SCRAPERS  (dynamic-first, hardcoded fallback)
# ═════════════════════════════════════════════════════════════════════════════

async def _scrape_attendance(page, base_url: str) -> list:
    """
    Dynamic: tries agent_workflows table first.
    Fallback: navigates directly to /attendance.
    Extracts data via Salesforce data-cell-value backdoor.
    """
    try:
        workflow = await get_workflow("attendance")
        if workflow and workflow.get("steps"):
            logger.info("[scrape_att] Running dynamic workflow")
            ok = await run_workflow(page, workflow["steps"])
            if not ok:
                logger.warning("[scrape_att] Workflow failed — using fallback navigation")
                await page.goto(f"{base_url}/attendance",
                                wait_until="domcontentloaded", timeout=45_000)
        else:
            logger.info("[scrape_att] No workflow — direct navigation")
            await page.goto(f"{base_url}/s/attendance",
                            wait_until="domcontentloaded", timeout=45_000)

        await page.wait_for_selector("table.slds-table tbody tr", timeout=30_000)
        return await _extract_slds_table(page, {
            "th[data-label='Course Name']":          "subject_raw",
            "td[data-label='Total Classes']":        "total",
            "td[data-label='Present']":              "attended",
            "td[data-label='Attendance Percentage']": "percent",
        }, _parse_attendance_row)

    except Exception as e:
        logger.warning(f"[scrape_att] Failed: {e}")
        return []


async def _scrape_profile(page, base_url: str) -> dict:
    """Navigate to profile page and extract key fields using flexible locators."""
    try:
        workflow = await get_workflow("profile")
        if workflow and workflow.get("steps"):
            await run_workflow(page, workflow["steps"])
        else:
            await page.goto(f"{base_url}/profile",
                            wait_until="domcontentloaded", timeout=30_000)

        profile = {}

        # Each field: try data-label span/div, then regex on full text
        field_map = {
            "name":          ["Name", "Student Name", "Full Name"],
            "enrollment_id": ["Enrollment ID", "Enrollment No", "Enrolment ID"],
            "roll_number":   ["Roll Number", "Roll No", "Roll"],
            "semester":      ["Current Semester", "Semester", "Sem"],
            "phone":         ["Phone", "Mobile", "Contact"],
            "cgpa":          ["CGPA", "Cumulative GPA"],
            "program":       ["Program", "Programme", "Course", "Degree"],
            "branch":        ["Branch", "Department", "Specialization"],
        }

        for key, labels in field_map.items():
            for label in labels:
                try:
                    # Salesforce: value is often in an adjacent sibling or
                    # a div/span with data-output-element-id containing the label text
                    val = await page.evaluate(f"""
                        () => {{
                            // Strategy 1: lightning-output-field next to label
                            const labels = document.querySelectorAll(
                                'span.slds-form-element__label, label, dt, th'
                            );
                            for (const lbl of labels) {{
                                if (lbl.innerText.toLowerCase().includes('{label.lower()}')) {{
                                    const parent = lbl.closest('.slds-form-element, tr, li, div');
                                    if (parent) {{
                                        const val = parent.querySelector(
                                            '.slds-form-element__static, dd, td, ' +
                                            'lightning-formatted-text, span:not(.slds-form-element__label)'
                                        );
                                        if (val) return val.innerText.trim();
                                    }}
                                    const next = lbl.nextElementSibling;
                                    if (next) return next.innerText.trim();
                                }}
                            }}
                            return null;
                        }}
                    """)
                    if val:
                        profile[key] = val
                        break
                except Exception:
                    pass

        # Fallback: regex on full page text
        page_text = await page.evaluate("() => document.body.innerText")
        if not profile.get("cgpa"):
            m = re.search(r"CGPA\s*[:\-]?\s*([\d.]+)", page_text, re.I)
            if m: profile["cgpa"] = m.group(1)
        if not profile.get("semester"):
            m = re.search(r"(?:Semester|Sem)\s*[:\-]?\s*([IVX\d]+)", page_text, re.I)
            if m: profile["semester"] = m.group(1)
        if not profile.get("name"):
            m = re.search(r"(?:Name)\s*[:\-]?\s*([A-Z][a-zA-Z\s]{2,40})", page_text)
            if m: profile["name"] = m.group(1).strip()

        return profile

    except Exception as e:
        logger.warning(f"[scrape_profile] Failed: {e}")
        return {}


async def _scrape_schedule(page, base_url: str) -> list:
    """
    Extract weekly timetable from the SLCM calendar/schedule page.
    Salesforce calendar events typically render as clickable tiles.
    """
    try:
        workflow = await get_workflow("schedule")
        if workflow and workflow.get("steps"):
            await run_workflow(page, workflow["steps"])
        else:
            await page.goto(f"{base_url}/schedule",
                            wait_until="domcontentloaded", timeout=30_000)

        # Wait for calendar or table
        try:
            await page.wait_for_selector(
                ".fc-event, .slds-table, table.slds-table, [class*='calendar']",
                timeout=15_000
            )
        except Exception:
            pass

        slots = await page.evaluate("""
        () => {
            const results = [];

            // ── FullCalendar events (fc-event) ─────────────────────────────
            document.querySelectorAll('.fc-event, .fc-time-grid-event').forEach(el => {
                const title = el.querySelector('.fc-title, .fc-content')?.innerText?.trim() || el.innerText.trim();
                const time  = el.querySelector('.fc-time')?.getAttribute('data-start') ||
                              el.querySelector('.fc-time')?.innerText?.trim() || '';
                const date  = el.closest('[data-date]')?.getAttribute('data-date') || '';
                if (title) results.push({ title, time, date, source: 'calendar' });
            });

            // ── slds-table rows ────────────────────────────────────────────
            if (results.length === 0) {
                document.querySelectorAll('table.slds-table tbody tr').forEach(row => {
                    const get = label => {
                        const el = row.querySelector(`td[data-label="${label}"], th[data-label="${label}"]`);
                        return el ? (el.getAttribute('data-cell-value') || el.innerText.trim()) : '';
                    };
                    const subject    = get('Subject')    || get('Course')     || get('Course Name') || '';
                    const classroom  = get('Classroom')  || get('Room')       || get('Venue')       || '';
                    const start_time = get('Start Time') || get('Start')      || '';
                    const end_time   = get('End Time')   || get('End')        || '';
                    const day        = get('Day')        || get('Date')       || '';
                    if (subject) results.push({ subject, classroom, start_time, end_time, day });
                });
            }

            // ── Text-block parsing for SLCM calendar-list layout ──────────
            if (results.length === 0) {
                const blocks = document.querySelectorAll(
                    '[class*="event"], [class*="slot"], [class*="session"], .slds-card'
                );
                blocks.forEach(el => {
                    const text = el.innerText.trim();
                    if (text.length > 5) results.push({ raw: text });
                });
            }

            return results;
        }
        """)

        # Parse raw blocks if structured extraction failed
        parsed = []
        for s in slots:
            if "raw" in s:
                parsed.append(_parse_raw_schedule_block(s["raw"]))
            elif s.get("title") or s.get("subject"):
                parsed.append(s)

        logger.info(f"[scrape_schedule] {len(parsed)} slots")
        return [p for p in parsed if p]

    except Exception as e:
        logger.warning(f"[scrape_schedule] Failed: {e}")
        return []


def _parse_raw_schedule_block(text: str) -> dict:
    """Parse a free-text schedule block like SLCM produces."""
    result = {}
    # Subject code pattern: "CSS 2201 : DATABASE SYSTEMS"
    m = re.search(r"([A-Z]{2,4}\s*\d{3,4})\s*[-:]\s*([^\n]+)", text)
    if m:
        result["code"]    = m.group(1).strip()
        result["subject"] = m.group(2).strip().title()
    # Classroom
    m = re.search(r"(?:Classroom|Room|Venue)\s*[:\-]?\s*([^\n]+)", text, re.I)
    if m: result["classroom"] = m.group(1).strip()
    # Times
    m = re.search(r"(\d{1,2}:\d{2}\s*[ap]m)\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]m)", text, re.I)
    if m:
        result["start_time"] = m.group(1).strip()
        result["end_time"]   = m.group(2).strip()
    m = re.search(r"(?:Start Time|Start)\s*[:\-]?\s*(\d{1,2}:\d{2}\s*[ap]m)", text, re.I)
    if m: result["start_time"] = m.group(1).strip()
    m = re.search(r"(?:End Time|End)\s*[:\-]?\s*(\d{1,2}:\d{2}\s*[ap]m)", text, re.I)
    if m: result["end_time"] = m.group(1).strip()
    return result if result else {}


async def _scrape_academics(page, base_url: str) -> dict:
    try:
        workflow = await get_workflow("academics")
        if workflow and workflow.get("steps"):
            ok = await run_workflow(page, workflow["steps"])
            if not ok:
                # Removed /s/
                await page.goto(f"{base_url}/academics", wait_until="domcontentloaded", timeout=45_000)
        else:
            # Removed /s/
            await page.goto(f"{base_url}/academics", wait_until="domcontentloaded", timeout=45_000)

        result: dict = {
            "cgpa": None, "gpa": None,
            "internal_results": [], "final_results": [],
            "credits_earned": None, "total_credits": None,
        }

        # ── Tab 1: Internal Result ──────────────────────────────────────────
        try:
            await asyncio.sleep(2) # Give base page time to settle
            await _safe_click(page, ["Internal Result", "Internal"])
            await asyncio.sleep(2) # Give Salesforce time to render the new tab
            
            await page.wait_for_selector("table.slds-table tbody tr", timeout=15_000)
            result["internal_results"] = await _extract_slds_table(
                page,
                {
                    "td[data-label='Course Code']":     "code",
                    "td[data-label='Course Name']":     "name",
                    "td[data-label='Credits']":         "credits",
                    "td[data-label='Attendance %']":    "attendance_pct",
                    "td[data-label='CA Marks']":        "ca_marks",
                    "td[data-label='MTA Marks']":       "mta_marks",
                    "th[data-label='Course Code']":     "code",
                    "th[data-label='Course Name']":     "name",
                },
                _parse_internal_row,
            )
            logger.info(f"[scrape_academics] Internal results: {len(result['internal_results'])}")
        except Exception as e:
            logger.warning(f"[scrape_academics] Internal Result tab failed: {e}")

        # ── Tab 2: Result (Final Grades + CGPA) ────────────────────────────
        try:
            await _safe_click(page, ["Result", "Results", "Final Result"])
            await asyncio.sleep(2)   # Give Salesforce time to render the new tab

            # Extract sidebar CGPA/GPA text
            sidebar_text = await page.evaluate("""
                () => {
                    const sidebar = document.querySelector(
                        '.slds-col:first-child, aside, [class*="sidebar"], ' +
                        '[class*="summary"], .slds-form'
                    );
                    return sidebar ? sidebar.innerText : document.body.innerText.slice(0, 3000);
                }
            """)
            cgpa_m = re.search(r"CGPA\s*[:\-]?\s*([\d.]+)", sidebar_text, re.I)
            gpa_m  = re.search(r"\bGPA\s*[:\-]?\s*([\d.]+)", sidebar_text, re.I)
            tc_m   = re.search(r"Total Credits.*?[:\-]?\s*(\d+)", sidebar_text, re.I)
            ce_m   = re.search(r"Credit[s]? Earned.*?[:\-]?\s*(\d+)", sidebar_text, re.I)

            if cgpa_m: result["cgpa"] = float(cgpa_m.group(1))
            if gpa_m:  result["gpa"]  = float(gpa_m.group(1))
            if tc_m:   result["total_credits"]  = int(tc_m.group(1))
            if ce_m:   result["credits_earned"] = int(ce_m.group(1))

            # Extract final results table
            try:
                await page.wait_for_selector("table.slds-table tbody tr", timeout=10_000)
                result["final_results"] = await _extract_slds_table(
                    page,
                    {
                        "td[data-label='Course Code']":    "code",
                        "td[data-label='Course Name']":    "name",
                        "td[data-label='Internal Marks']": "internal_marks",
                        "td[data-label='Grade']":          "grade",
                        "th[data-label='Course Code']":    "code",
                        "th[data-label='Course Name']":    "name",
                    },
                    _parse_final_row,
                )
                logger.info(f"[scrape_academics] Final results: {len(result['final_results'])}")
            except Exception as e:
                logger.warning(f"[scrape_academics] Final results table: {e}")

        except Exception as e:
            logger.warning(f"[scrape_academics] Result tab failed: {e}")

        return result

    except Exception as e:
        logger.warning(f"[scrape_academics] Top-level error: {e}")
        return {}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED TABLE EXTRACTOR (Salesforce data-cell-value backdoor)
# ─────────────────────────────────────────────────────────────────────────────
async def _extract_slds_table(page, selector_map: dict, row_parser) -> list:
    """
    selector_map: { "td[data-label='X']": "field_name", ... }
    row_parser:   fn(raw_dict) → dict | None
    """
    rows = await page.query_selector_all("table.slds-table tbody tr")
    results = []
    for row in rows:
        raw = {}
        for selector, key in selector_map.items():
            el = await row.query_selector(selector)
            if el:
                raw[key] = (await el.get_attribute("data-cell-value") or
                            await el.inner_text() or "").strip()
        parsed = row_parser(raw)
        if parsed:
            results.append(parsed)
    return results


def _parse_attendance_row(raw: dict) -> dict | None:
    sr = raw.get("subject_raw", "")
    if not sr:
        return None
    code, name = ("", sr.strip().title())
    if " : " in sr:
        parts = sr.split(" : ", 1)
        code  = parts[0].strip()
        name  = parts[1].strip().title()
    total    = _safe_int(raw.get("total", "0"))
    attended = _safe_int(raw.get("attended", "0"))
    pct      = _safe_float(raw.get("percent", "0"))
    if total == 0 and attended == 0 and pct == 0:
        return None
    return {"code": code, "name": name,
            "attended": attended, "total": total,
            "percent": round(pct, 1), "safe": pct >= 75.0}


def _parse_internal_row(raw: dict) -> dict | None:
    code = raw.get("code", "").strip()
    name = raw.get("name", "").strip().title()
    if not code and not name:
        return None
    return {
        "code":           code,
        "name":           name,
        "credits":        _safe_float(raw.get("credits", "0")),
        "attendance_pct": _safe_float(raw.get("attendance_pct", "0")),
        "ca_marks":       _safe_float(raw.get("ca_marks", "0")),
        "mta_marks":      _safe_float(raw.get("mta_marks", "0")),
    }


def _parse_final_row(raw: dict) -> dict | None:
    code = raw.get("code", "").strip()
    name = raw.get("name", "").strip().title()
    if not code and not name:
        return None
    return {
        "code":           code,
        "name":           name,
        "internal_marks": _safe_float(raw.get("internal_marks", "0")),
        "grade":          raw.get("grade", "").strip(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# DB CACHE WRITERS
# ─────────────────────────────────────────────────────────────────────────────
def _cache_data(email: str, data_type: str, data):
    try:
        _supabase.table("cached_data").upsert({
            "user_email": email,
            "type":       data_type,
            "data":       json.dumps(data),
            "updated_at": _now(),
        }, on_conflict="user_email,type").execute()
    except Exception as e:
        logger.error(f"[cache] cached_data write failed ({data_type}): {e}")


def _write_attendance_cache(email: str, records: list):
    try:
        now  = _now()
        rows = [{
            "user_email":   email,
            "subject_code": r.get("code", ""),
            "subject_name": r.get("name", ""),
            "attended":     int(r.get("attended", 0)),
            "total":        int(r.get("total", 0)),
            "percent":      float(r.get("percent", 0)),
            "safe":         bool(r.get("safe", False)),
            "fetched_at":   now,
        } for r in records]
        if rows:
            _supabase.table("attendance_cache") \
                .upsert(rows, on_conflict="user_email,subject_code") \
                .execute()
    except Exception as e:
        logger.error(f"[cache] attendance_cache write failed: {e}")


# ─── Type coercions ───────────────────────────────────────────────────────────
def _safe_int(s) -> int:
    try: return int(float(str(s).strip().split("/")[0]))
    except: return 0

def _safe_float(s) -> float:
    try: return float(str(s).strip().replace("%", "").replace(",", ""))
    except: return 0.0