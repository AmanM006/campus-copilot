# recorder_server.py
import asyncio
import json
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from playwright.async_api import async_playwright
from openai import AsyncOpenAI
from supabase import create_client
from dotenv import load_dotenv, find_dotenv
import uvicorn

load_dotenv(find_dotenv())

app = FastAPI()

# Allow Next.js to talk to this specific microservice
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_supabase = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
)

client = AsyncOpenAI(base_url="https://models.inference.ai.azure.com", api_key=os.getenv("GITHUB_TOKEN"))

@app.post("/api/record-omni-workflow")
async def record_omni_workflow():
    async def event_stream():
        def log(msg_type, text):
            return f"event: log\ndata: {json.dumps({'type': msg_type, 'msg': text})}\n\n"

        yield log("info", "🚀 Launching Omni-Recorder microservice...")
        
        raw_events = []
        recording_active = [False]

        async def handle_click(text):
            if not recording_active[0]: return
            if text and text.strip():
                clean_text = text.strip().split('\n')[0]
                if len(clean_text) > 2 and clean_text not in ["SLCM", "Home", "More"]:
                    raw_events.append({"action": "click", "target": clean_text})
                    print(f"⏺️ Click: {clean_text}")

        def handle_navigation(frame):
            if not recording_active[0]: return
            if frame == frame.page.main_frame and "/s/" in frame.url:
                raw_events.append({"action": "navigate", "url": frame.url})
                print(f"🔗 Nav: {frame.url.split('manipal.edu')[-1]}")

        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=False)
                context = await browser.new_context()
                page = await context.new_page()

                page.on("framenavigated", handle_navigation)
                await page.expose_function("recordClickPython", handle_click)

                js_injector = """
                document.addEventListener('click', (e) => {
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

                yield log("warn", "🌐 Browser open. Please log in manually.")
                await page.goto("https://maheslcmtech.manipal.edu")

                try:
                    await page.wait_for_url("**/s/**", timeout=120000)
                    recording_active[0] = True
                    yield log("success", "✅ Login detected! Recording is now ACTIVE.")
                    yield log("info", "👉 Click through Attendance, Academics, Schedule, etc.")
                    yield log("warn", "🛑 CLOSE THE BROWSER WINDOW WHEN FINISHED.")
                except Exception:
                    yield log("error", "❌ Timed out waiting for login.")
                    yield "event: done\ndata: {}\n\n"
                    return

                try:
                    await page.wait_for_event("close", timeout=0)
                except Exception:
                    pass

            yield log("info", "🛑 Browser closed. Analyzing session...")

            if not raw_events:
                yield log("error", "⚠️ No clicks recorded. Aborting.")
                yield "event: done\ndata: {}\n\n"
                return

            yield log("info", "🧠 Sending raw click logs to GPT-4o for sorting...")
            
            prompt = f"""
            You are an RPA architecture AI. Segment this continuous session into distinct "workflows" (e.g., 'attendance', 'academics', 'schedule', 'profile').
            For each workflow, extract the relevant steps. Ignore login/logout steps.
            Output STRICT JSON. Keys = workflow names, Values = arrays of steps.
            Logs: {json.dumps(raw_events)}
            """

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": prompt}],
                temperature=0.1
            )
            
            raw_json = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
            sorted_workflows = json.loads(raw_json)
            
            yield log("success", f"✅ AI successfully mapped {len(sorted_workflows)} distinct workflows!")
            
            yield log("info", "💾 Saving AI workflows to Supabase...")
            for action_name, steps in sorted_workflows.items():
                _supabase.table("agent_workflows").upsert({
                    "action_name": action_name,
                    "steps": steps,
                    "portal_url": "https://maheslcmtech.manipal.edu"
                }, on_conflict="action_name").execute()

            yield log("success", "🎉 All workflows saved! Setup complete.")
            yield "event: done\ndata: {\"success\": true}\n\n"
            
        except Exception as e:
            yield log("error", f"❌ Process failed: {str(e)}")
            yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    print("\n🎥 OMNI-RECORDER MICROSERVICE RUNNING ON PORT 8001")
    uvicorn.run(app, host="127.0.0.1", port=8001)