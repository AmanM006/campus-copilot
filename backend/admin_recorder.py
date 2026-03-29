import asyncio
import json
import os
from playwright.async_api import async_playwright
from openai import AsyncOpenAI
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Using your exact OpenAI setup from main.py
github_token = os.getenv("GITHUB_TOKEN")
if not github_token:

    raise ValueError("GITHUB_TOKEN missing in .env")
client = AsyncOpenAI(
    base_url="https://models.inference.ai.azure.com",
    api_key=os.environ.get("GITHUB_TOKEN")
 # 🚨 Force the fresh token here!
)
# The master log of EVERYTHING the admin does
raw_events = []

async def handle_click(text):
    if text and text.strip():
        clean_text = text.strip().split('\n')[0]
        # Ignore junk clicks
        if len(clean_text) > 2 and clean_text not in ["SLCM", "Home", "More"]:
            print(f"🖱️  Clicked: '{clean_text}'")
            raw_events.append({"action": "click", "target": clean_text})

def handle_navigation(frame):
    # Only track main page navigations, not hidden background iframes
    if frame == frame.page.main_frame and "/s/" in frame.url:
        print(f"🔗 Navigated to: {frame.url.split('manipal.edu')[-1]}")
        raw_events.append({"action": "navigate", "url": frame.url})

async def process_with_ai(events):
    print("\n" + "="*50)
    print("🧠 SENDING RAW LOGS TO AI FOR SORTING...")
    print("="*50)
    
    prompt = f"""
    You are an RPA architecture AI. 
    An administrator just navigated through a university portal. Here is the raw chronological log of their clicks and URL navigations:
    {json.dumps(events, indent=2)}

    Your job is to segment this continuous session into distinct "workflows" (e.g., 'attendance', 'academics', 'schedule', 'profile').
    For each workflow, extract the relevant steps needed to get there and execute it.
    
    Output a STRICT JSON object where the keys are the workflow names, and the values are arrays of steps.
    Example format:
    {{
        "attendance": [
            {{"type": "navigate", "url": "https://maheslcmtech.manipal.edu/s/attendance"}},
            {{"type": "wait_nav", "timeout": 6000}}
        ],
        "academics": [
            {{"type": "navigate", "url": "https://maheslcmtech.manipal.edu/s/academics"}},
            {{"type": "wait_nav", "timeout": 6000}},
            {{"type": "click", "labels": ["Internal Result"]}}
        ]
    }}
    ONLY output valid JSON. No markdown formatting blocks, no explanations.
    """

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": prompt}],
        temperature=0.1
    )
    
    # Clean the response in case the LLM wraps it in ```json ... ```
    raw_json = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
    return json.loads(raw_json)

async def main():
    print("\n" + "="*50)
    print("🎥 OMNI-RECORDER: LOG IN ONCE, CLICK EVERYTHING.")
    print("="*50)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        # Track URL changes automatically
        page.on("framenavigated", handle_navigation)
        await page.expose_function("recordClickPython", handle_click)

        # The SHADOW-DOM Piercing Click Tracker
        js_injector = """
        document.addEventListener('click', (e) => {
            // composedPath() allows us to pierce the Salesforce Shadow DOM
            let path = e.composedPath();
            let text = '';
            for (let el of path) {
                if (el.innerText) { text = el.innerText; break; }
                if (el.getAttribute && el.getAttribute('data-label')) { text = el.getAttribute('data-label'); break; }
                if (el.getAttribute && el.getAttribute('title')) { text = el.getAttribute('title'); break; }
            }
            if (text) window.recordClickPython(text);
        }, { capture: true });
        """
        await page.add_init_script(js_injector)

        print("🌐 Opening portal. Please log in.")
        print("👉 Go ahead. Click through Attendance, Academics, Schedule, etc.")
        print("🛑 WHEN YOU ARE FINISHED, CLOSE THE BROWSER WINDOW.")
        
        await page.goto("https://maheslcmtech.manipal.edu")

        try:
            await page.wait_for_event("close", timeout=0)
        except Exception:
            pass

        if not raw_events:
            print("⚠️ No events were recorded. Aborting.")
            return

        # Let the AI sort the mess!
        try:
            sorted_workflows = await process_with_ai(raw_events)
            print("\n✅ AI SUCCESSFULLY MAPPED THE PORTAL:")
            print(json.dumps(sorted_workflows, indent=2))
        except Exception as e:
            print(f"❌ AI Processing failed: {e}")
            print("Raw events were:", raw_events)

if __name__ == "__main__":
    asyncio.run(main())