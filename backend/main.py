import os, json, datetime, asyncio, logging
import datetime as _dt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, AsyncGenerator
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI
from pinecone import Pinecone
from tools import get_lab_tools
from attendance_pipeline import get_attendance_for_user

load_dotenv(find_dotenv())

# 👉 1. Import your new agent router
from agent_routes import agent_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("main")

github_token = os.getenv("GITHUB_TOKEN")
pinecone_key = os.getenv("PINECONE_API_KEY")
if not github_token: raise ValueError("GITHUB_TOKEN missing")
if not pinecone_key: raise ValueError("PINECONE_API_KEY missing")

app = FastAPI()

# 👉 2. Mount the agent routes to your main app!
app.include_router(agent_router)

app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

client = OpenAI(base_url="https://models.inference.ai.azure.com", 
api_key=os.environ.get("GITHUB_TOKEN"))
pc     = Pinecone(api_key=pinecone_key)
index  = pc.Index("campus-copilot")

class ChatRequest(BaseModel):
    message: str
    user_id: str
    history: Optional[List[Dict[str, str]]] = []
    role:    Optional[str] = "student"

# ─── Campus Data (Mocks retained for features not yet scraped) ─────────────────
MOCK_EXAM_SCHEDULE = [
    {"code":"MAT 2201","subject":"Probability and Optimization",           "date":"2026-03-06","time":"8:30–10:00 AM","hall":"ELH-1"},
    {"code":"CSS 2201","subject":"Database Systems",                        "date":"2026-03-07","time":"8:30–10:00 AM","hall":"ELH-2"},
    {"code":"CSS 2202","subject":"Design & Analysis of Algorithms",         "date":"2026-03-09","time":"8:30–10:00 AM","hall":"ELH-1"},
    {"code":"CSS 2203","subject":"Introduction to Artificial Intelligence", "date":"2026-03-10","time":"8:30–10:00 AM","hall":"LH-301"},
    {"code":"CSS 2204","subject":"Operating Systems",                       "date":"2026-03-11","time":"8:30–10:00 AM","hall":"LH-302"},
]
MOCK_FEES = {"total_outstanding":97000,"dues":[
    {"category":"Tuition","amount":85000,"due_date":"2026-03-31","status":"Pending"},
    {"category":"Hostel", "amount":12000,"due_date":"2026-03-15","status":"Overdue"},
    {"category":"Mess",   "amount":3200, "due_date":"2026-03-31","status":"Paid"},
]}
MOCK_LAB  = {
    "robotics":    {"morning":"Available","afternoon":"Booked",    "evening":"Available"},
    "osdl":        {"morning":"Booked",   "afternoon":"Available", "evening":"Available"},
    "ai/ml":       {"morning":"Available","afternoon":"Available", "evening":"Booked"},
    "cnc":         {"morning":"Available","afternoon":"Available", "evening":"Available"},
    "electronics": {"morning":"Booked",   "afternoon":"Available", "evening":"Available"},
}
MOCK_NOTICES = [
    {"id":1,"title":"IV Sem Midsem Exam Timetable Released","category":"exam","date":"2026-03-05","detail":"All exams 6–11 March, 8:30–10:00 AM."},
    {"id":2,"title":"Lab Safety Workshop – March 12, CC-4","category":"academic","date":"2026-03-04","detail":"Mandatory for 4th sem students."},
]
MOCK_MESS = {
    "Monday":   {"breakfast":"Idli, Sambar, Chutney, Boiled Eggs","lunch":"Rice, Dal Tadka, Paneer Butter Masala, Roti, Salad","dinner":"Chapati, Veg Curry, Curd Rice, Pickle"},
    "Tuesday":  {"breakfast":"Poha, Boiled Eggs, Tea","lunch":"Rice, Rajma, Aloo Sabzi, Roti, Raita","dinner":"Paratha, Mixed Veg, Dal, Kheer"},
    "Wednesday":{"breakfast":"Dosa, Coconut Chutney, Sambhar, Tea","lunch":"Rice, Sambar, Veg Kootu, Roti","dinner":"Chapati, Egg Curry, Rice, Curd"},
    "Thursday": {"breakfast":"Upma, Peanuts, Tea","lunch":"Biryani (Veg/Non-Veg), Raita, Pickle","dinner":"Roti, Dal Makhani, Aloo Gobi, Salad"},
    "Friday":   {"breakfast":"Puri, Chole, Tea","lunch":"Rice, Fish Curry, Dal, Roti, Salad","dinner":"Chapati, Paneer Masala, Rice, Payasam"},
    "Saturday": {"breakfast":"Bread Toast, Omelette, Tea","lunch":"Fried Rice, Manchurian, Soup","dinner":"Roti, Mixed Dal, Aloo Fry, Curd"},
    "Sunday":   {"breakfast":"Pongal, Vada, Sambhar, Tea","lunch":"Special Thali — Rice, Sambar, Rasam, Papad, Sweet","dinner":"Chapati, Paneer, Dal, Rice, Ice Cream"},
}

# ─── Shared cache reader ──────────────────────────────────────────────────────
async def _get_cached(user_email: str, data_type: str):
    """
    Fetch one row from cached_data for (user_email, type).
    Returns the parsed Python object, or None if not found.
    """
    try:
        from supabase import create_client
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
        )
        result = sb.table("cached_data") \
            .select("data, updated_at") \
            .eq("user_email", user_email) \
            .eq("type", data_type) \
            .maybe_single() \
            .execute()
        if result.data and result.data.get("data"):
            raw = result.data["data"]
            return json.loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        logger.warning(f"[_get_cached] {data_type} for {user_email}: {e}")
    return None

# ─── Tool Executors ────────────────────────────────────────────────────────────
def exec_book(a,uid):
    k=a.get("lab_name","").lower().split()[0]
    av=MOCK_LAB.get(k,{"morning":"Available","afternoon":"Available","evening":"Available"})
    sl=a.get("slot","afternoon")
    if av.get(sl)=="Booked":
        alt=next((s for s,v in av.items() if v=="Available"),None)
        return {"lab_name":a.get("lab_name"),"date":a.get("date"),"slot":sl,
                "status":"conflict","message":f"{sl.capitalize()} is already booked. The {alt} slot is available." if alt else "No slots available.",
                "booking_id":None,"alt_slot":alt}
    return {"lab_name":a.get("lab_name"),"date":a.get("date"),"slot":sl,
            "purpose":a.get("purpose","—"),
            "booking_id":f"BK-{uid[:4].upper()}-{abs(hash(str(a)))%900+100}",
            "status":"ready_for_confirmation"}

def exec_avail(a):
    k=a.get("lab_name","").lower().split()[0]
    return {"lab_name":a.get("lab_name"),"date":a.get("date"),
            "slots":MOCK_LAB.get(k,{"morning":"Available","afternoon":"Available","evening":"Available"})}

def exec_cancel(a,uid): return {"booking_id":a.get("booking_id","BK-LAST"),"status":"cancelled"}

async def exec_att(a, uid, user_email: str = ""):
    if not user_email:
        raise RuntimeError("Cannot fetch attendance — your email is not available. Please sign out and sign back in.")
    
    logger.info(f"[exec_att] Fetching attendance for {user_email}")
    records = await get_attendance_for_user(user_email)
    
    if not records:
        raise RuntimeError(
            "I'm fetching your fresh attendance data right now. "
            "A secure portal window has opened — please log in there, "
            "wait a few seconds for the sync to complete, then ask me again!"
        )
    
    code = a.get("subject_code")
    if code:
        records = [r for r in records if r.get("code", "").upper() == code.upper()]
    return {"records": records}

async def exec_grades(a, uid, user_email: str = ""):
    if not user_email:
        raise RuntimeError("Email not available — please sign in again.")
    data = await _get_cached(user_email, "academics")
    if not data:
        raise RuntimeError(
            "I'm fetching your academics data right now. "
            "A portal window will open — please log in, wait a moment, then ask again."
        )
    return data

def exec_exams(a,uid): return {"student":"Aman Mehta","type":"IV Sem Midterm","time":"8:30 AM – 10:00 AM","exams":MOCK_EXAM_SCHEDULE}

async def exec_tt(a, uid, user_email: str = ""):
    if not user_email:
        raise RuntimeError("Email not available — please sign in again.")

    day_param = a.get("day", "today").lower()
    if day_param == "today":
        target_day = _dt.datetime.now().strftime("%A")
    elif day_param == "tomorrow":
        target_day = (_dt.datetime.now() + _dt.timedelta(days=1)).strftime("%A")
    else:
        target_day = day_param.capitalize()

    # Try DB schedule table first (populated by teacher import)
    try:
        from supabase import create_client
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
        )
        user_res = sb.table("users").select("id").eq("email", user_email).maybe_single().execute()
        student_id = user_res.data["id"] if user_res.data else None

        if student_id:
            enrolled = sb.table("subject_enrollments").select("subject_id").eq("student_id", student_id).execute()
            ids = [e["subject_id"] for e in (enrolled.data or [])]
            if ids:
                slots = sb.table("schedule") \
                    .select("day, start_time, end_time, room, type, subjects(name,code)") \
                    .in_("subject_id", ids) \
                    .eq("day", target_day) \
                    .order("start_time") \
                    .execute()
                if slots.data:
                    return {"day": target_day, "classes": [
                        {
                            "time":    f"{s['start_time'][:5]}–{s['end_time'][:5]}",
                            "subject": s["subjects"]["name"] if s.get("subjects") else "—",
                            "room":    s.get("room", "—"),
                            "type":    s.get("type", "lecture"),
                        }
                        for s in slots.data
                    ]}
    except Exception as e:
        logger.warning(f"[exec_tt] DB schedule failed: {e}")

    # Fallback: cached_data from portal scraper
    data = await _get_cached(user_email, "schedule")
    if not data:
        raise RuntimeError(
            "Your timetable isn't synced yet. "
            "Please wait for the portal sync to complete and ask again."
        )

    classes = [
        s for s in (data if isinstance(data, list) else [])
        if str(s.get("day", "")).lower() == target_day.lower()
        or str(s.get("date", "")).lower() == target_day.lower()
    ]
    return {"day": target_day, "classes": classes}

async def exec_profile(a, uid, user_email: str = ""):
    if not user_email:
        raise RuntimeError("Email not available — please sign in again.")
    data = await _get_cached(user_email, "profile")
    if not data:
        raise RuntimeError("Your profile isn't synced yet. Please wait a moment and ask again.")
    return data

async def exec_bunk(a, uid, user_email: str = ""):
    from attendance_pipeline import get_attendance_for_user
    records = await get_attendance_for_user(user_email)
    if not records:
        raise RuntimeError("Attendance not synced yet — please log into the portal and ask again.")
    code = a.get("subject_code")
    if code:
        records = [r for r in records if r.get("code", "").upper() == code.upper()]

    enriched = []
    for r in records:
        att = r.get("attended", 0)
        tot = r.get("total", 0)
        safe_miss = max(0, int((att - 0.75 * (tot + 0)) / 0.75))
        needed    = max(0, _classes_to_75(att, tot))
        enriched.append({**r, "can_miss": safe_miss, "classes_needed": needed})
    return {"records": enriched}

def _classes_to_75(attended: int, total: int) -> int:
    if total == 0: return 0
    if attended / total >= 0.75: return 0
    x = 0
    while (attended + x) / (total + x) < 0.75:
        x += 1
        if x > 200: break
    return x

async def exec_marks(a, uid, user_email: str = ""):
    return await exec_grades(a, uid, user_email)

def exec_fees(a,uid): return {"student":"Aman Mehta",**MOCK_FEES}

def exec_griev(a,uid): return {
    "ticket_id":f"GRV-MIT-{abs(hash(a.get('subject','x')))%900+100}",
    "category":a.get("category"),"subject":a.get("subject"),
    "urgency":a.get("urgency","medium"),"status":"Submitted","expected_response":"2–3 business days"}

def exec_doc(a,uid): return {
    "request_id":f"DOC-MIT-{abs(hash(a.get('document_type','x')))%900+100}",
    "document_type":a.get("document_type"),"purpose":a.get("purpose"),
    "status":"Processing","ready_in":"1 working day" if a.get("urgency")=="urgent" else "3–5 working days"}

def exec_mess(a):
    day=a.get("day","today")
    if day in ("today",""): day=datetime.datetime.now().strftime("%A")
    elif day=="tomorrow": day=(datetime.datetime.now()+datetime.timedelta(days=1)).strftime("%A")
    day=day.capitalize(); meal=a.get("meal","all"); menu=MOCK_MESS.get(day,MOCK_MESS["Monday"])
    return {"day":day,"menu":{meal:menu[meal]} if meal!="all" and meal in menu else menu}

def exec_notices(a):
    limit=int(a.get("limit",5)); cat=a.get("category","all")
    return {"notices":[n for n in MOCK_NOTICES if cat=="all" or n["category"]==cat][:limit]}

# ─── Dispatcher ────────────────────────────────────────────────────────────────
DISPATCH = {
    "book_lab_slot":                  {"fn": exec_book,    "nu": True,  "at": "tool_interaction",    "r": lambda a: f"Here's the lab access request for **{a.get('lab_name')}**:"},
    "check_lab_availability":         {"fn": exec_avail,   "nu": False, "at": "lab_availability",    "r": lambda a: f"Here's the availability for **{a.get('lab_name')}**:"},
    "cancel_lab_booking":             {"fn": exec_cancel,  "nu": True,  "at": "cancel_booking",      "r": lambda a: "Your lab request has been cancelled."},
    "get_attendance":                 {"fn": exec_att,     "nu": True,  "at": "attendance_report",   "r": lambda a: "Here's your attendance this semester:", "is_async": True},
    "get_attendance_bunk_calculator": {"fn": exec_bunk,    "nu": True,  "at": "attendance_report",   "r": lambda a: "Here's your bunk analysis:", "is_async": True},
    "get_grades":                     {"fn": exec_grades,  "nu": True,  "at": "grades_report",       "r": lambda a: "Here are your grades:", "is_async": True},
    "get_exam_schedule":              {"fn": exec_exams,   "nu": True,  "at": "exam_schedule",       "r": lambda a: "Here's your IV Sem Midterm schedule:"},
    "get_timetable":                  {"fn": exec_tt,      "nu": True,  "at": "timetable",           "r": lambda a: f"Here's your schedule for **{a.get('day', 'today')}**:", "is_async": True},
    "get_fee_status":                 {"fn": exec_fees,    "nu": True,  "at": "fee_status",          "r": lambda a: "Here's your current fee status:"},
    "raise_grievance":                {"fn": exec_griev,   "nu": True,  "at": "grievance_submitted", "r": lambda a: f"Your complaint has been submitted under **{a.get('category')}**:"},
    "request_bonafide_certificate":   {"fn": exec_doc,     "nu": True,  "at": "document_request",    "r": lambda a: f"Your **{a.get('document_type', 'document')}** request has been submitted:"},
    "get_mess_menu":                  {"fn": exec_mess,    "nu": False, "at": "mess_menu",           "r": lambda a: f"Here's the mess menu for **{a.get('day', 'today')}**:"},
    "get_campus_notices":             {"fn": exec_notices, "nu": False, "at": "campus_notices",      "r": lambda a: "Here are the latest campus notices:"},
}

# ─── Format tool results as markdown ──────────────────────────────────────────
def fmt(at, res, args):
    if at == "attendance_report":
        rows = res.get("records", [])
        out  = "\n\n| Subject | Code | Attended | Total | % | Status |\n"
        out += "|---|---|---|---|---|---|\n"
        for r in rows:
            status    = "✅ Safe"   if r.get("safe") else "⚠️ At risk"
            can_miss  = r.get("can_miss", "—")
            needed    = r.get("classes_needed", "—")
            pct_str   = f"{r.get('percent', 0):.1f}%"
            out += (f"| {r.get('name','?')} | {r.get('code','')} "
                    f"| {r.get('attended',0)} | {r.get('total',0)} "
                    f"| {pct_str} | {status} |\n")
        return out

    elif at == "grades_report":
        cgpa  = res.get("cgpa")
        gpa   = res.get("gpa")
        tc    = res.get("total_credits")
        ce    = res.get("credits_earned")

        header = "\n\n"
        if cgpa: header += f"**CGPA: {cgpa}**"
        if gpa:  header += f"  |  Semester GPA: {gpa}"
        if tc:   header += f"  |  Total Credits: {tc}"
        if ce:   header += f"  |  Earned: {ce}"
        header += "\n\n"

        internal = res.get("internal_results", [])
        if internal:
            header += "### Internal Marks\n\n"
            header += "| Code | Subject | Credits | Attendance | CA | MTA |\n"
            header += "|---|---|---|---|---|---|\n"
            for r in internal:
                header += (f"| {r.get('code','')} | {r.get('name','')} "
                           f"| {r.get('credits','')} | {r.get('attendance_pct','')}% "
                           f"| {r.get('ca_marks','')} | {r.get('mta_marks','')} |\n")

        final = res.get("final_results", [])
        if final:
            header += "\n### Final Grades\n\n"
            header += "| Code | Subject | Internal Marks | Grade |\n"
            header += "|---|---|---|---|\n"
            for r in final:
                header += (f"| {r.get('code','')} | {r.get('name','')} "
                           f"| {r.get('internal_marks','')} | **{r.get('grade','')}** |\n")
        return header

    elif at == "timetable":
        cl = res.get("classes", [])
        if not cl:
            return f"\n\nNo classes scheduled for **{res.get('day','today')}**."
        out = f"\n\n**{res.get('day','Today')}'s Schedule**\n\n"
        out += "| Time | Subject | Room | Type |\n|---|---|---|---|\n"
        for c in cl:
            out += (f"| {c.get('time','?')} | {c.get('subject','?')} "
                    f"| {c.get('room','?')} | {c.get('type','lecture')} |\n")
        return out

    elif at == "exam_schedule":
        out  = "\n\n| Subject | Code | Date | Time | Hall |\n"
        out += "|---|---|---|---|---|\n"
        for e in res.get("exams", []):
            out += (f"| {e.get('subject','?')} | {e.get('code','')} "
                    f"| {e.get('date','')} | {e.get('time','')} | {e.get('hall','')} |\n")
        return out + f"\n_Timing: {res.get('time','')}_ "

    elif at == "fee_status":
        out = f"\n\n**Total outstanding: ₹{res.get('total_outstanding', 0):,}**\n\n"
        for d in res.get("dues", []):
            icon = "🔴" if d["status"] == "Overdue" else "🟡" if d["status"] == "Pending" else "✅"
            out += f"{icon} **{d['category']}**: ₹{d['amount']:,} — {d['status']} (due {d['due_date']})\n"
        return out

    elif at == "mess_menu":
        return "\n\n" + "".join(f"**{m.capitalize()}**: {i}\n\n" for m, i in res.get("menu", {}).items())

    elif at == "campus_notices":
        return "\n\n" + "".join(f"**{n['title']}** _{n['date']}_\n{n.get('detail','')}\n\n" for n in res.get("notices", []))

    elif at == "lab_availability":
        return "\n\n" + "".join(f"{'✅' if s == 'Available' else '🔴'} **{sl.capitalize()}**: {s}\n" for sl, s in res.get("slots", {}).items())
        
    elif at == "grievance_submitted": return f"\n\nTicket ID: **{res.get('ticket_id')}** · Expected response: {res.get('expected_response')}"
    elif at == "document_request": return f"\n\nRequest ID: **{res.get('request_id')}** · Ready in: {res.get('ready_in')}"
    return ""

def sse(event,data): return f"event: {event}\ndata: {json.dumps(data)}\n\n"

def build_system(role, context):
    today = datetime.datetime.now().strftime("%A, %d %B %Y")
    if role=="faculty":
        return f"""You are Campus Copilot, an AI assistant for faculty at Manipal Institute of Technology.
Today's date is {today}.
You assist Dr. Priya Sharma (CSE, Associate Professor) with class management, attendance, analytics, lab approvals, and grievances.
Be concise, professional, and data-driven.
CAMPUS KNOWLEDGE: {context or 'No specific context retrieved.'}"""
    return f"""You are Campus Copilot, a helpful AI assistant for students at Manipal Institute of Technology (MIT).
Today's date is {today}.
You are helping Aman Mehta (ID: 213CS1001, 4th semester, Computer Science & Engineering, CGPA 8.4).
You have access to his attendance, grades, exam schedule, timetable, fees, and lab booking system via tools.
ALWAYS call the appropriate tool when the student asks for any campus data — never say you don't have access.
For general questions (dates, campus policies, advice), just answer directly and helpfully.
Be friendly, concise, and student-focused.
CAMPUS KNOWLEDGE BASE: {context or 'No specific context retrieved.'}"""

# ─── Streaming endpoint ────────────────────────────────────────────────────────
@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    async def generate() -> AsyncGenerator[str,None]:
        full_text = ""
        try:
            yield sse("rag_start", {})
            await asyncio.sleep(0)
            emb     = client.embeddings.create(input=req.message, model="text-embedding-3-small")
            results = index.query(vector=emb.data[0].embedding, top_k=3, include_metadata=True)
            context = ""; sources = []
            for m in results.get("matches",[]):
                if "metadata" in m and "text" in m["metadata"] and m.get("score",0) > 0.5:
                    context += m["metadata"]["text"]+"\n\n"
                    sources.append({"text":m["metadata"]["text"][:150]+"…","score":round(m.get("score",0),3)})
            if sources:
                yield sse("rag", {"sources": sources})
            await asyncio.sleep(0)

            sys_prompt = build_system(req.role, context)
            messages   = [{"role":"system","content":sys_prompt}]
            for m in req.history:
                if m.get("role") in ["user","assistant"]:
                    messages.append({"role":m["role"],"content":m["content"]})
            messages.append({"role":"user","content":req.message})

            ck = {}
            if req.role != "faculty":
                ck["tools"]       = get_lab_tools()
                ck["tool_choice"] = "auto"

            first_response = client.chat.completions.create(
                model="gpt-4o", messages=messages, temperature=0.7,
                max_tokens=800, **ck
            )
            msg_obj   = first_response.choices[0].message
            tool_calls = getattr(msg_obj, "tool_calls", None)

            if tool_calls:
                tc        = tool_calls[0]
                tool_name = tc.function.name
                args      = json.loads(tc.function.arguments)
                print(f"  [TOOL] {tool_name} | {args}")

                d = DISPATCH.get(tool_name)
                if not d:
                    yield sse("error",{"message":"Unknown tool called."}); return

                try:
                    if d.get("is_async"):
                        raw_email = req.user_id if "@" in req.user_id else f"{req.user_id}@learner.manipal.edu"
                        # Convert aman8_mitmpl to aman8.mitmpl
                        user_email = raw_email.replace("_mitmpl", ".mitmpl").replace("_work", ".work")
                        result = await d["fn"](args, req.user_id, user_email)
                    elif d.get("nu"):
                        result = d["fn"](args, req.user_id)
                    else:
                        result = d["fn"](args)
                except RuntimeError as e:
                    err_msg = str(e)
                    logger.warning(f"[tool] {tool_name} failed: {err_msg}")
                    yield sse("token", {"text": f"⚠️ {err_msg}"})
                    yield sse("done",  {"full_text": f"⚠️ {err_msg}"})
                    return

                action_type = d["at"]
                reply_text  = d["r"](args) + fmt(action_type, result, args)

                for char in reply_text:
                    yield sse("token",{"text":char})
                    full_text += char
                    await asyncio.sleep(0.002)

                yield sse("action",{
                    "type":      action_type,
                    "tool_name": tool_name,
                    "status":    "Pending Confirmation" if action_type == "tool_interaction" else "Success",
                    "details":   {**args, **result},
                })

            elif msg_obj.content:
                for char in msg_obj.content:
                    yield sse("token",{"text":char})
                    full_text += char
                    await asyncio.sleep(0.002)

            yield sse("done",{"full_text": full_text or msg_obj.content or ""})

        except Exception as e:
            import traceback; traceback.print_exc()
            print(f"Stream error: {e}")
            yield sse("error",{"message":f"Something went wrong: {str(e)}"})

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

# ─── Non-streaming fallback ────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        emb     = client.embeddings.create(input=req.message, model="text-embedding-3-small")
        results = index.query(vector=emb.data[0].embedding, top_k=3, include_metadata=True)
        context = "".join(m["metadata"]["text"]+"\n\n" for m in results.get("matches",[])
                          if "metadata" in m and "text" in m["metadata"])
        sys_prompt = build_system(req.role, context)
        messages   = [{"role":"system","content":sys_prompt}]
        for m in req.history:
            if m.get("role") in ["user","assistant"]:
                messages.append({"role":m["role"],"content":m["content"]})
        messages.append({"role":"user","content":req.message})
        ck = {}
        if req.role != "faculty":
            ck["tools"] = get_lab_tools(); ck["tool_choice"] = "auto"
        response = client.chat.completions.create(model="gpt-4o",messages=messages,temperature=0.7,max_tokens=800,**ck)
        msg = response.choices[0].message
        tcs = getattr(msg,"tool_calls",None)
        if tcs:
            tc=tcs[0]; tname=tc.function.name; args=json.loads(tc.function.arguments)
            d=DISPATCH.get(tname)
            if not d: return {"reply":msg.content or "Unknown tool.","action":None}
            
            try:
                if d.get("is_async"):
                    raw_email = req.user_id if "@" in req.user_id else f"{req.user_id}@learner.manipal.edu"
                    user_email = raw_email.replace("_mitmpl", ".mitmpl").replace("_work", ".work") 
                    result = await d["fn"](args, req.user_id, user_email)
                elif d.get("nu"):
                    result = d["fn"](args, req.user_id)
                else:
                    result = d["fn"](args)
            except RuntimeError as e:
                return {"reply": f"⚠️ {str(e)}", "action": None}
                
            at=d["at"]
            return {"reply":d["r"](args)+fmt(at,result,args),
                    "action":{"type":at,"tool_name":tname,"status":"Pending Confirmation" if at=="tool_interaction" else "Success","details":{**args,**result}}}
        return {"reply":msg.content,"action":None}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"reply":"I hit a snag. Please try again.","action":None}

if __name__=="__main__":
    import uvicorn; uvicorn.run(app,host="0.0.0.0",port=8000)