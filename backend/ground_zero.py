import asyncio
import re
from playwright.async_api import async_playwright

async def main():
    print("\n" + "="*60)
    print("🚀 GROUND ZERO V3 (The Semester Looper)")
    print("="*60)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=50)
        context = await browser.new_context()
        page = await context.new_page()

        print("🌐 Opening portal. Please log in (you have 2 minutes)...")
        await page.goto("https://maheslcmtech.manipal.edu")

        try:
            await page.wait_for_url("**/s/**", timeout=120000)
            print("✅ Login successful! Reached dashboard.")
        except Exception:
            print("❌ Timed out.")
            await browser.close()
            return

        print("\n📚 Navigating to Academics tab...")
        await page.goto("https://maheslcmtech.manipal.edu/s/academics")
        await asyncio.sleep(6)
        
        # ─── GO TO RESULT TAB ───
        print("\n🖱️ Clicking 'Result' tab...")
        try:
            tab = page.get_by_role("tab", name=re.compile("Result", re.I))
            if await tab.count() > 0:
                exact_tab = tab.filter(has_text=re.compile("^Result$", re.I))
                if await exact_tab.count() > 0: await exact_tab.first.click()
                else: await tab.first.click()
            await asyncio.sleep(6)
        except Exception as e:
            print(f"❌ Error clicking Result: {e}")

        # ─── EXTRACT SUMMARY STATS (CGPA, Credits) ───
        print("\n" + "="*50)
        print("📈 DUMP: SUMMARY STATS (CGPA & Credits)")
        print("="*50)
        page_text = await page.evaluate("() => document.body.innerText")
        page_text = page_text.replace('\xa0', ' ') # Clean up weird spaces
        
        cgpa_m = re.search(r"CGPA\s*[:\-]?\s*([\d.]+)", page_text, re.I)
        gpa_m  = re.search(r"\bGPA\s*[:\-]?\s*([\d.]+)", page_text, re.I)
        ce_m = re.search(r"Total Credits Earned\s*[:\-]?\s*(\d+)", page_text, re.I)
        
        print(f"👉 Found CGPA: {cgpa_m.group(1) if cgpa_m else 'NOT FOUND'}")
        print(f"👉 Found GPA:  {gpa_m.group(1) if gpa_m else 'NOT FOUND'}")
        print(f"👉 Found Credits Earned: {ce_m.group(1) if ce_m else 'NOT FOUND'}")

        # ─── LOOP THROUGH EVERY SEMESTER ───
        print("\n" + "="*50)
        print("🔄 DUMP: SCANNING ALL SEMESTERS")
        print("="*50)
        
        try:
            # 1. Find the dropdown and click it to open the list
            combo_box = page.locator("lightning-combobox").filter(has_text=re.compile(r"Select Semester", re.I))
            dropdown_btn = combo_box.locator("button, input").first
            await dropdown_btn.click()
            await asyncio.sleep(2)
            
            # 2. Get all the options available in the dropdown
            options = await page.locator("lightning-base-combobox-item").all_inner_texts()
            # Clean up empty strings
            semesters = [opt.strip() for opt in options if opt.strip()]
            print(f"🎯 Found {len(semesters)} semesters: {semesters}")
            
            # Click it again to close it before we start the loop
            await dropdown_btn.click()
            await asyncio.sleep(1)

            # 3. Loop through the list we just found
            for sem in semesters:
                print(f"\n{'='*40}")
                print(f"📅 EXTRACTING: {sem}")
                print(f"{'='*40}")
                
                # Open dropdown, click the specific semester, wait for Salesforce to load
                await dropdown_btn.click()
                await asyncio.sleep(1)
                await page.locator("lightning-base-combobox-item").filter(has_text=re.compile(f"^{sem}$", re.I)).first.click()
                
                print(f"⏳ Waiting 5 seconds for {sem} data to load...")
                await asyncio.sleep(5)
                
                # Check if it says "No data found"
                empty_loc = page.get_by_text("No data found", exact=False).first
                if await empty_loc.is_visible():
                    print("⚠️ No data found for this semester.")
                    continue

                # Extract the visible data-labels
                cells = await page.locator("[data-label]").all()
                found_data = False
                for cell in cells:
                    if not await cell.is_visible():
                        continue
                    label = (await cell.get_attribute("data-label") or "").strip()
                    text = (await cell.inner_text() or "").strip()
                    if label and text and label not in ["Ongoing Semester", "Courses Enrolled", "Internal Result", "Result"]:
                        print(f"| {label}: {text}")
                        found_data = True
                
                if not found_data:
                    print("⚠️ Found the table, but no visible cells were extracted.")

        except Exception as e:
            print(f"❌ Error looping through semesters: {e}")

        print("\n" + "="*50)
        print("✅ DONE. Closing browser in 5 seconds...")
        await asyncio.sleep(5)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())