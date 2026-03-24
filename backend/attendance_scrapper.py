"""
attendance_scraper.py
─────────────────────
Playwright-based scraper for the Manipal student portal.
Called by attendance_pipeline.py when the cache is stale or missing.
"""

import asyncio
import json
import logging
import re
from typing import Optional

logger = logging.getLogger("attendance_scraper")

PORTAL_URL = "https://maheslcmtech.manipal.edu"

# ─── Safe Click ───────────────────────────────────────────────────────────────
async def safe_click(page, labels: list[str], timeout: int = 8000) -> bool:
    """
    Try multiple strategies to click an element.
    Returns True if click succeeded, False otherwise.
    """
    for label in labels:
        # Strategy 1: getByRole (button, link, menuitem)
        for role in ("button", "link", "menuitem", "tab"):
            try:
                loc = page.get_by_role(role, name=re.compile(label, re.IGNORECASE))
                if await loc.count() > 0:
                    await loc.first.click(timeout=timeout)
                    logger.debug(f"  [safeClick] role={role} label={label!r} ✓")
                    return True
            except Exception:
                pass

        # Strategy 2: getByText
        try:
            loc = page.get_by_text(re.compile(label, re.IGNORECASE))
            if await loc.count() > 0:
                await loc.first.click(timeout=timeout)
                logger.debug(f"  [safeClick] getByText label={label!r} ✓")
                return True
        except Exception:
            pass

        # Strategy 3: CSS / XPath contains text
        for selector in [
            f"text=/{label}/i",
            f"[class*='nav'] :text-matches('{label}', 'i')",
            f"a:has-text('{label}')",
            f"span:has-text('{label}')",
            f"li:has-text('{label}')",
        ]:
            try:
                loc = page.locator(selector)
                if await loc.count() > 0:
                    await loc.first.click(timeout=timeout)
                    logger.debug(f"  [safeClick] CSS selector={selector!r} ✓")
                    return True
            except Exception:
                pass

    logger.warning(f"  [safeClick] FAILED for labels={labels}")
    return False


# ─── Extract attendance table ─────────────────────────────────────────────────
async def extract_attendance_table(page) -> list[dict]:
    """
    Find the attendance table on the page and parse rows.
    Returns list of { code, name, attended, total, percent }
    Handles multiple common table structures.
    """
    records = []

    # Wait for any table to appear
    try:
        await page.wait_for_selector("table", timeout=10000)
    except Exception:
        logger.warning("  [extract] No table found on page")
        return records

    # Try to parse via JS for robustness
    raw = await page.evaluate("""
        () => {
            const tables = document.querySelectorAll('table');
            const results = [];
            
            for (const table of tables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                if (rows.length < 2) continue;
                
                // Get header row to find column indices
                const headers = Array.from(rows[0].querySelectorAll('th, td'))
                    .map(h => h.innerText.trim().toLowerCase());
                
                // Find relevant column indices
                const codeIdx    = headers.findIndex(h => h.includes('code') || h.includes('subject code'));
                const nameIdx    = headers.findIndex(h => h.includes('name') || h.includes('subject name') || h.includes('course'));
                const attendIdx  = headers.findIndex(h => h.includes('attend') && !h.includes('total') && !h.includes('%'));
                const totalIdx   = headers.findIndex(h => h.includes('total') || h.includes('conducted') || h.includes('held'));
                const percentIdx = headers.findIndex(h => h.includes('%') || h.includes('percent') || h.includes('ratio'));
                
                // Skip if we can't find enough columns
                if (attendIdx === -1 && percentIdx === -1) continue;
                
                for (const row of rows.slice(1)) {
                    const cells = Array.from(row.querySelectorAll('td'))
                        .map(c => c.innerText.trim());
                    if (cells.length < 2) continue;
                    
                    const attended = parseInt(cells[attendIdx] || '0') || 0;
                    const total    = parseInt(cells[totalIdx]  || '0') || 0;
                    let   percent  = parseFloat(cells[percentIdx] || '0') || 0;
                    
                    // Compute percent if not available
                    if (percent === 0 && attended > 0 && total > 0)
                        percent = Math.round((attended / total) * 100 * 10) / 10;
                    
                    const code = codeIdx >= 0 ? cells[codeIdx] : '';
                    const name = nameIdx >= 0 ? cells[nameIdx] : cells[0] || 'Unknown';
                    
                    if (total > 0 || percent > 0) {
                        results.push({ code, name, attended, total, percent });
                    }
                }
                
                // If we found data, stop
                if (results.length > 0) break;
            }
            return results;
        }
    """)

    if raw:
        logger.info(f"  [extract] Found {len(raw)} attendance records")
        records = raw

    return records


# ─── Main scraper ─────────────────────────────────────────────────────────────
async def fetch_attendance_via_agent(
    email: str,
    storage_state: Optional[dict] = None,
    portal_url: str = PORTAL_URL,
) -> list[dict]:
    """
    Launch a Playwright browser, restore saved session, navigate to
    the attendance page, and extract the attendance table.

    Args:
        email:         student email (used for logging)
        storage_state: Playwright storage state dict (cookies + localStorage)
                       If None, raises an error — caller must provide session.
        portal_url:    portal base URL

    Returns:
        List of attendance dicts: { code, name, attended, total, percent }

    Raises:
        RuntimeError: if session is missing, navigation fails, or no data found
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright is not installed. Run: pip install playwright && playwright install chromium"
        )

    if not storage_state:
        raise RuntimeError(
            "No portal session found for this user. "
            "Please log into the portal first and save your session."
        )

    logger.info(f"[scraper] Starting Playwright for {email}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # Restore saved session
        context = await browser.new_context(storage_state=storage_state)
        page    = await context.new_page()

        try:
            # Navigate to portal
            logger.info(f"[scraper] Navigating to {portal_url}")
            await page.goto(portal_url, wait_until="networkidle", timeout=30000)

            # Check if session is still valid (not redirected to login)
            current_url = page.url
            if "login" in current_url.lower() or "signin" in current_url.lower():
                raise RuntimeError(
                    "Portal session has expired. Please log in again."
                )

            # Navigate to attendance section
            # Try common navigation paths
            nav_success = False

            # Path 1: Direct "Attendance" menu
            if await safe_click(page, ["Attendance"]):
                nav_success = True
                await page.wait_for_load_state("networkidle", timeout=8000)

            # Path 2: Academic → Attendance
            if not nav_success:
                if await safe_click(page, ["Academic", "Academics"]):
                    await page.wait_for_load_state("networkidle", timeout=5000)
                    if await safe_click(page, ["Attendance", "View Attendance", "My Attendance"]):
                        nav_success = True
                        await page.wait_for_load_state("networkidle", timeout=8000)

            # Path 3: Student → Academic Performance → Attendance
            if not nav_success:
                if await safe_click(page, ["Student", "My Profile"]):
                    await page.wait_for_load_state("networkidle", timeout=5000)
                    if await safe_click(page, ["Attendance", "Academic"]):
                        nav_success = True
                        await page.wait_for_load_state("networkidle", timeout=8000)

            if not nav_success:
                # Try direct URL patterns common to Manipal portals
                for path in [
                    "/student/attendance",
                    "/academic/attendance",
                    "/attendance/view",
                    "/myattendance",
                ]:
                    try:
                        await page.goto(f"{portal_url}{path}", timeout=8000)
                        await page.wait_for_selector("table", timeout=5000)
                        nav_success = True
                        break
                    except Exception:
                        pass

            if not nav_success:
                raise RuntimeError(
                    "Could not navigate to attendance page. "
                    "Portal structure may have changed."
                )

            logger.info("[scraper] Reached attendance page, extracting data…")

            # Extract the table
            records = await extract_attendance_table(page)

            if not records:
                raise RuntimeError(
                    "Attendance page loaded but no data found. "
                    "The portal may use a different layout."
                )

            logger.info(f"[scraper] Successfully scraped {len(records)} records for {email}")
            return records

        finally:
            await browser.close()