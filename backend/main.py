import os
import json
import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI
from pinecone import Pinecone
from tools import get_lab_tools

load_dotenv(find_dotenv())

github_token = os.getenv("GITHUB_TOKEN")
if not github_token:
    raise ValueError("CRITICAL: GITHUB_TOKEN missing from .env")
pinecone_key = os.getenv("PINECONE_API_KEY")
if not pinecone_key:
    raise ValueError("CRITICAL: PINECONE_API_KEY missing from .env")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(base_url="https://models.inference.ai.azure.com", api_key=github_token)
pc = Pinecone(api_key=pinecone_key)
index = pc.Index("campus-copilot")

# ─── Request Model ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    user_id: str
    history: Optional[List[Dict[str, str]]] = []
    role: Optional[str] = "student"  # "student" | "faculty"

# ─── All Hardcoded Campus Data ─────────────────────────────────────────────────

MOCK_ATTENDANCE = [
    {"code": "MAT 2201", "name": "Probability and Optimization",           "attended": 38, "total": 45, "percent": 84},
    {"code": "CSS 2201", "name": "Database Systems",                        "attended": 29, "total": 42, "percent": 69},
    {"code": "CSS 2202", "name": "Design & Analysis of Algorithms",         "attended": 40, "total": 44, "percent": 91},
    {"code": "CSS 2203", "name": "Introduction to Artificial Intelligence", "attended": 31, "total": 43, "percent": 72},
    {"code": "CSS 2204", "name": "Operating Systems",                       "attended": 22, "total": 24, "percent": 92},
]

MOCK_GRADES = {
    "cgpa": 8.4,
    "semester_gpa": 8.7,
    "subjects": [
        {"code": "MAT 2201", "name": "Probability and Optimization",           "grade": "A",  "points": 9,  "marks": 78},
        {"code": "CSS 2201", "name": "Database Systems",                        "grade": "B+", "points": 8,  "marks": 71},
        {"code": "CSS 2202", "name": "Design & Analysis of Algorithms",         "grade": "A+", "points": 10, "marks": 91},
        {"code": "CSS 2203", "name": "Introduction to Artificial Intelligence", "grade": "B",  "points": 7,  "marks": 65},
        {"code": "CSS 2204", "name": "Operating Systems",                       "grade": "A",  "points": 9,  "marks": 82},
    ]
}

MOCK_EXAM_SCHEDULE = [
    {"code": "MAT 2201", "subject": "Probability and Optimization",           "date": "2026-03-06", "time": "8:30–10:00 AM", "hall": "ELH-1"},
    {"code": "CSS 2201", "subject": "Database Systems",                        "date": "2026-03-07", "time": "8:30–10:00 AM", "hall": "ELH-2"},
    {"code": "CSS 2202", "subject": "Design & Analysis of Algorithms",         "date": "2026-03-09", "time": "8:30–10:00 AM", "hall": "ELH-1"},
    {"code": "CSS 2203", "subject": "Introduction to Artificial Intelligence", "date": "2026-03-10", "time": "8:30–10:00 AM", "hall": "LH-301"},
    {"code": "CSS 2204", "subject": "Operating Systems",                       "date": "2026-03-11", "time": "8:30–10:00 AM", "hall": "LH-302"},
]

MOCK_TIMETABLE = {
    "Monday":    [
        {"time": "08:00–09:00", "subject": "Probability & Optimization", "room": "LH-301", "type": "lecture"},
        {"time": "09:00–10:00", "subject": "Database Systems",           "room": "LH-204", "type": "lecture"},
        {"time": "10:15–11:15", "subject": "Design & Analysis of Algo",  "room": "LH-102", "type": "lecture"},
        {"time": "11:30–13:30", "subject": "OS Lab",                     "room": "OSDL-B", "type": "lab"},
        {"time": "14:30–15:30", "subject": "Operating Systems",          "room": "LH-301", "type": "lecture"},
    ],
    "Tuesday":   [
        {"time": "08:00–09:00", "subject": "Intro to AI",                "room": "LH-205", "type": "lecture"},
        {"time": "09:00–10:00", "subject": "Operating Systems",          "room": "LH-301", "type": "lecture"},
        {"time": "11:00–13:00", "subject": "DBMS Lab",                   "room": "LAB-4",  "type": "lab"},
        {"time": "14:00–15:00", "subject": "Probability & Optimization", "room": "LH-102", "type": "lecture"},
    ],
    "Wednesday": [
        {"time": "08:00–09:00", "subject": "Database Systems",           "room": "LH-204", "type": "lecture"},
        {"time": "09:15–10:15", "subject": "Design & Analysis of Algo",  "room": "LH-102", "type": "lecture"},
        {"time": "10:30–11:30", "subject": "Intro to AI",                "room": "LH-205", "type": "lecture"},
        {"time": "14:00–15:00", "subject": "Operating Systems",          "room": "LH-301", "type": "lecture"},
    ],
    "Thursday":  [
        {"time": "08:00–09:00", "subject": "Probability & Optimization", "room": "LH-301", "type": "lecture"},
        {"time": "10:00–12:00", "subject": "Algorithms Lab",             "room": "CC-3",   "type": "lab"},
        {"time": "13:00–14:00", "subject": "Database Systems",           "room": "LH-204", "type": "lecture"},
        {"time": "14:00–15:00", "subject": "Intro to AI",                "room": "LH-205", "type": "lecture"},
    ],
    "Friday":    [
        {"time": "08:00–09:00", "subject": "Design & Analysis of Algo",  "room": "LH-102", "type": "lecture"},
        {"time": "09:00–10:00", "subject": "Operating Systems",          "room": "LH-301", "type": "lecture"},
        {"time": "10:15–11:15", "subject": "Intro to AI",                "room": "LH-205", "type": "lecture"},
    ],
    "Saturday":  [
        {"time": "08:00–09:00", "subject": "Database Systems",           "room": "LH-204", "type": "lecture"},
        {"time": "09:00–10:00", "subject": "Probability & Optimization", "room": "LH-102", "type": "lecture"},
    ],
    "Sunday": [],
}

MOCK_FEES = {
    "total_outstanding": 97000,
    "dues": [
        {"category": "Tuition",  "amount": 85000, "due_date": "2026-03-31", "status": "Pending"},
        {"category": "Hostel",   "amount": 12000, "due_date": "2026-03-15", "status": "Overdue"},
        {"category": "Mess",     "amount":  3200, "due_date": "2026-03-31", "status": "Paid"},
    ]
}

MOCK_LAB_AVAILABILITY = {
    "robotics": {"morning": "Available", "afternoon": "Booked",    "evening": "Available"},
    "osdl":     {"morning": "Booked",    "afternoon": "Available",  "evening": "Available"},
    "ai/ml":    {"morning": "Available", "afternoon": "Available",  "evening": "Booked"},
    "cnc":      {"morning": "Available", "afternoon": "Available",  "evening": "Available"},
    "electronics": {"morning": "Booked","afternoon": "Available",  "evening": "Available"},
}

MOCK_NOTICES = [
    {"id": 1, "title": "IV Sem Midsem Exam Timetable Released",     "category": "exam",      "date": "2026-03-05", "detail": "All exams from 6–11 March, 8:30–10:00 AM. Check official notice board for hall allotments."},
    {"id": 2, "title": "Lab Safety Workshop – March 12, CC-4",      "category": "academic",  "date": "2026-03-04", "detail": "Mandatory for all 4th sem students. Attendance will be marked."},
    {"id": 3, "title": "Placement Drive: TCS – March 18",           "category": "placement", "date": "2026-03-03", "detail": "Eligible: CGPA >= 7.0, no active backlogs. Register on the placement portal by March 14."},
    {"id": 4, "title": "Hostel Maintenance – Block C, March 15–16", "category": "hostel",    "date": "2026-03-02", "detail": "Hot water unavailable. Alternative in Block A common area."},
    {"id": 5, "title": "Sports Day Registration Open",              "category": "event",     "date": "2026-03-01", "detail": "Register for track, field, and indoor events at the Sports Office before March 10."},
]

MOCK_MESS_MENU = {
    "Monday":    {"breakfast": "Idli, Sambar, Chutney, Boiled Eggs",     "lunch": "Rice, Dal Tadka, Paneer Butter Masala, Roti, Salad",          "dinner": "Chapati, Veg Curry, Curd Rice, Pickle"},
    "Tuesday":   {"breakfast": "Poha, Boiled Eggs, Tea",                  "lunch": "Rice, Rajma, Aloo Sabzi, Roti, Raita",                         "dinner": "Paratha, Mixed Veg, Dal, Kheer"},
    "Wednesday": {"breakfast": "Dosa, Coconut Chutney, Sambhar, Tea",     "lunch": "Rice, Sambar, Veg Kootu, Roti",                                "dinner": "Chapati, Egg Curry, Rice, Curd"},
    "Thursday":  {"breakfast": "Upma, Peanuts, Tea",                      "lunch": "Biryani (Veg/Non-Veg), Raita, Pickle",                         "dinner": "Roti, Dal Makhani, Aloo Gobi, Salad"},
    "Friday":    {"breakfast": "Puri, Chole, Tea",                        "lunch": "Rice, Fish Curry, Dal, Roti, Salad",                           "dinner": "Chapati, Paneer Masala, Rice, Payasam"},
    "Saturday":  {"breakfast": "Bread Toast, Omelette, Tea",              "lunch": "Fried Rice, Manchurian, Soup",                                 "dinner": "Roti, Mixed Dal, Aloo Fry, Curd"},
    "Sunday":    {"breakfast": "Pongal, Vada, Sambhar, Tea",              "lunch": "Special Thali — Rice, Sambar, Rasam, Papad, Sweet",            "dinner": "Chapati, Paneer, Dal, Rice, Ice Cream"},
}

# ─── Tool Executors ───────────────────────────────────────────────────────────

def execute_book_lab_slot(args, user_id):
    lab_key = args.get("lab_name", "").lower().split()[0]
    avail = MOCK_LAB_AVAILABILITY.get(lab_key, {"morning": "Available", "afternoon": "Available", "evening": "Available"})
    slot = args.get("slot", "afternoon")
    if avail.get(slot) == "Booked":
        alt = next((s for s, v in avail.items() if v == "Available"), None)
        return {"lab_name": args.get("lab_name"), "date": args.get("date"), "slot": slot,
                "status": "conflict", "message": f"{slot.capitalize()} is booked. {alt.capitalize() if alt else 'No'} slot available.",
                "booking_id": None}
    return {"lab_name": args.get("lab_name"), "date": args.get("date"), "slot": slot,
            "purpose": args.get("purpose", "—"),
            "booking_id": f"BK-{user_id[:4].upper()}-{abs(hash(str(args)))%900+100}",
            "status": "ready_for_confirmation"}

def execute_check_lab_availability(args):
    lab_key = args.get("lab_name", "").lower().split()[0]
    slots = MOCK_LAB_AVAILABILITY.get(lab_key, {"morning": "Available", "afternoon": "Available", "evening": "Available"})
    return {"lab_name": args.get("lab_name"), "date": args.get("date"), "slots": slots}

def execute_cancel_lab_booking(args, user_id):
    return {"booking_id": args.get("booking_id", "BK-LAST"), "status": "cancelled"}

def execute_get_attendance(args, user_id):
    code = args.get("subject_code")
    records = [r for r in MOCK_ATTENDANCE if not code or r["code"] == code]
    enriched = []
    for r in records:
        can_bunk = max(0, int((r["attended"] - 0.75 * r["total"]) / 0.75)) if r["percent"] >= 75 else 0
        need = max(0, int((0.75 * r["total"] - r["attended"]) / 0.25) + 1) if r["percent"] < 75 else 0
        enriched.append({**r, "can_bunk": can_bunk, "need_to_attend": need, "safe": r["percent"] >= 75})
    return {"student": "Aman Mehta", "semester": 4, "records": enriched}

def execute_get_grades(args, user_id):
    return {"student": "Aman Mehta", **MOCK_GRADES}

def execute_get_exam_schedule(args, user_id):
    return {"student": "Aman Mehta", "type": "IV Sem Midterm", "time": "8:30 AM – 10:00 AM",
            "exams": MOCK_EXAM_SCHEDULE}

def execute_get_timetable(args, user_id):
    day = args.get("day", "today")
    if day == "today":
        day = datetime.datetime.now().strftime("%A")
    elif day == "tomorrow":
        day = (datetime.datetime.now() + datetime.timedelta(days=1)).strftime("%A")
    day = day.capitalize()
    return {"student": "Aman Mehta", "day": day, "classes": MOCK_TIMETABLE.get(day, [])}

def execute_get_fee_status(args, user_id):
    return {"student": "Aman Mehta", **MOCK_FEES}

def execute_raise_grievance(args, user_id):
    return {"ticket_id": f"GRV-MIT-{abs(hash(args.get('subject','x')))%900+100}",
            "category": args.get("category"), "subject": args.get("subject"),
            "urgency": args.get("urgency", "medium"), "status": "Submitted",
            "expected_response": "2–3 business days"}

def execute_request_bonafide(args, user_id):
    return {"request_id": f"DOC-MIT-{abs(hash(args.get('document_type','x')))%900+100}",
            "document_type": args.get("document_type"), "purpose": args.get("purpose"),
            "status": "Processing",
            "ready_in": "1 working day" if args.get("urgency") == "urgent" else "3–5 working days"}

def execute_get_mess_menu(args):
    day = args.get("day", "today")
    if day in ("today", ""):
        day = datetime.datetime.now().strftime("%A")
    elif day == "tomorrow":
        day = (datetime.datetime.now() + datetime.timedelta(days=1)).strftime("%A")
    day = day.capitalize()
    meal = args.get("meal", "all")
    menu = MOCK_MESS_MENU.get(day, MOCK_MESS_MENU["Monday"])
    return {"day": day, "menu": {meal: menu[meal]} if meal != "all" and meal in menu else menu}

def execute_get_campus_notices(args):
    limit = int(args.get("limit", 5))
    cat = args.get("category", "all")
    notices = [n for n in MOCK_NOTICES if cat == "all" or n["category"] == cat]
    return {"notices": notices[:limit]}

# ─── Dispatcher ───────────────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "book_lab_slot":                  {"fn": execute_book_lab_slot,          "needs_user": True,  "action_type": "tool_interaction",
                                        "reply": lambda a: f"Booking request prepared for **{a.get('lab_name')}** lab on **{a.get('date')}**."},
    "check_lab_availability":         {"fn": execute_check_lab_availability,  "needs_user": False, "action_type": "lab_availability",
                                        "reply": lambda a: f"Availability for **{a.get('lab_name')}** on **{a.get('date')}**:"},
    "cancel_lab_booking":             {"fn": execute_cancel_lab_booking,      "needs_user": True,  "action_type": "cancel_booking",
                                        "reply": lambda a: "Booking cancelled."},
    "get_attendance":                 {"fn": execute_get_attendance,          "needs_user": True,  "action_type": "attendance_report",
                                        "reply": lambda a: "Here's your attendance for this semester:"},
    "get_attendance_bunk_calculator": {"fn": execute_get_attendance,          "needs_user": True,  "action_type": "attendance_report",
                                        "reply": lambda a: "Here's your attendance summary:"},
    "get_grades":                     {"fn": execute_get_grades,              "needs_user": True,  "action_type": "grades_report",
                                        "reply": lambda a: "Here are your grades:"},
    "get_exam_schedule":              {"fn": execute_get_exam_schedule,       "needs_user": True,  "action_type": "exam_schedule",
                                        "reply": lambda a: "Your IV Sem Midterm timetable:"},
    "get_timetable":                  {"fn": execute_get_timetable,           "needs_user": True,  "action_type": "timetable",
                                        "reply": lambda a: f"Your schedule for **{a.get('day', 'today')}**:"},
    "get_fee_status":                 {"fn": execute_get_fee_status,          "needs_user": True,  "action_type": "fee_status",
                                        "reply": lambda a: "Your fee status:"},
    "raise_grievance":                {"fn": execute_raise_grievance,         "needs_user": True,  "action_type": "grievance_submitted",
                                        "reply": lambda a: f"Grievance submitted under **{a.get('category')}**."},
    "request_bonafide_certificate":   {"fn": execute_request_bonafide,        "needs_user": True,  "action_type": "document_request",
                                        "reply": lambda a: f"**{a.get('document_type', 'Document')}** certificate request submitted."},
    "get_mess_menu":                  {"fn": execute_get_mess_menu,           "needs_user": False, "action_type": "mess_menu",
                                        "reply": lambda a: f"Mess menu for **{a.get('day', 'today')}**:"},
    "get_campus_notices":             {"fn": execute_get_campus_notices,      "needs_user": False, "action_type": "campus_notices",
                                        "reply": lambda a: "Latest campus notices:"},
}

# ─── Format tool results as readable markdown ─────────────────────────────────

def format_result(action_type: str, result: dict, args: dict) -> str:
    if action_type == "attendance_report":
        rows = result.get("records", [])
        out = "\n\n| Subject | Attended/Total | % | Status |\n|---|---|---|---|\n"
        for r in rows:
            status = "✅ Safe" if r["safe"] else "⚠️ At risk"
            out += f"| {r['name']} | {r['attended']}/{r['total']} | {r['percent']}% | {status} |\n"
        return out

    elif action_type == "grades_report":
        out = f"\n\n**CGPA: {result['cgpa']}** | Semester GPA: {result['semester_gpa']}\n\n"
        for s in result["subjects"]:
            out += f"- **{s['code']}** {s['name']}: **{s['grade']}** ({s['marks']}/100)\n"
        return out

    elif action_type == "exam_schedule":
        out = "\n\n| Subject | Code | Date | Hall |\n|---|---|---|---|\n"
        for e in result["exams"]:
            out += f"| {e['subject']} | {e['code']} | {e['date']} | {e['hall']} |\n"
        out += f"\n_All exams at {result['time']}_"
        return out

    elif action_type == "timetable":
        classes = result.get("classes", [])
        if not classes:
            return "\n\nNo classes scheduled."
        out = "\n\n"
        for c in classes:
            out += f"- **{c['time']}** — {c['subject']} · {c['room']} _{c['type']}_\n"
        return out

    elif action_type == "fee_status":
        out = f"\n\n**Total outstanding: ₹{result['total_outstanding']:,}**\n\n"
        for d in result["dues"]:
            icon = "🔴" if d["status"] == "Overdue" else "🟡" if d["status"] == "Pending" else "✅"
            out += f"{icon} **{d['category']}**: ₹{d['amount']:,} — {d['status']} (due {d['due_date']})\n"
        return out

    elif action_type == "mess_menu":
        out = "\n\n"
        for meal, items in result.get("menu", {}).items():
            out += f"**{meal.capitalize()}**: {items}\n\n"
        return out

    elif action_type == "campus_notices":
        out = "\n\n"
        for n in result.get("notices", []):
            out += f"**{n['title']}** _{n['date']}_\n{n.get('detail', '')}\n\n"
        return out

    elif action_type == "lab_availability":
        out = "\n\n"
        for slot, status in result.get("slots", {}).items():
            icon = "✅" if status == "Available" else "🔴"
            out += f"{icon} **{slot.capitalize()}**: {status}\n"
        return out

    elif action_type == "grievance_submitted":
        return f"\n\nTicket ID: **{result.get('ticket_id')}** · Expected response: {result.get('expected_response')}"

    elif action_type == "document_request":
        return f"\n\nRequest ID: **{result.get('request_id')}** · Ready in: {result.get('ready_in')}"

    return ""

# ─── Chat Endpoint ─────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    print(f"[{req.role.upper()}] {req.user_id}: {req.message}")

    try:
        # RAG search for campus knowledge (policies, rules, prerequisites)
        emb = client.embeddings.create(input=req.message, model="text-embedding-3-small")
        results = index.query(vector=emb.data[0].embedding, top_k=3, include_metadata=True)
        context = "".join(
            m["metadata"]["text"] + "\n\n"
            for m in results.get("matches", [])
            if "metadata" in m and "text" in m["metadata"]
        )

        if req.role == "faculty":
            system_prompt = f"""You are Campus Copilot for faculty at Manipal Institute of Technology.
You assist Dr. Priya Sharma (CSE, Associate Professor) with class management, attendance reports,
student analytics, lab approvals, and grievances.
Be concise, professional, and data-driven.
CAMPUS KNOWLEDGE: {context or 'Use general MIT knowledge.'}"""
        else:
            system_prompt = f"""You are Campus Copilot for students at Manipal Institute of Technology.
You assist Aman Mehta (213CS1001, 4th sem CSE, CGPA 8.4).
You have real access to his attendance, grades, exams, timetable, fees, and can book labs.
ALWAYS call the appropriate tool when the student asks for data — never say you don't have access.
Be concise and friendly.
CAMPUS KNOWLEDGE: {context or 'Use general MIT knowledge.'}"""

        messages = [{"role": "system", "content": system_prompt}]
        for m in req.history:
            if m.get("role") in ["user", "assistant"]:
                messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": req.message})

        # Student gets tools, faculty gets open-ended chat
        call_kwargs = {}
        if req.role != "faculty":
            call_kwargs["tools"] = get_lab_tools()
            call_kwargs["tool_choice"] = "auto"

        response = client.chat.completions.create(
            model="gpt-4o", messages=messages, temperature=0.7, max_tokens=700, **call_kwargs
        )

        msg = response.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None)

        if tool_calls:
            tc = tool_calls[0]
            tool_name = tc.function.name
            args = json.loads(tc.function.arguments)
            print(f"  Tool: {tool_name} | Args: {args}")

            dispatch = TOOL_DISPATCH.get(tool_name)
            if not dispatch:
                return {"reply": msg.content or "Unknown tool.", "action": None}

            result = dispatch["fn"](args, req.user_id) if dispatch["needs_user"] else dispatch["fn"](args)
            action_type = dispatch["action_type"]
            reply = dispatch["reply"](args) + format_result(action_type, result, args)

            return {
                "reply": reply,
                "action": {
                    "type": action_type,
                    "tool_name": tool_name,
                    "status": "Pending Confirmation" if action_type == "tool_interaction" else "Success",
                    "details": {**args, **result},
                },
            }

        return {"reply": msg.content, "action": None}

    except Exception as e:
        print(f"Error: {e}")
        return {"reply": "I hit a snag. Please try again.", "action": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)