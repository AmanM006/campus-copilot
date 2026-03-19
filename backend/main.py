import os, json, datetime, asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, AsyncGenerator
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI
from pinecone import Pinecone
from tools import get_lab_tools

load_dotenv(find_dotenv())
github_token = os.getenv("GITHUB_TOKEN")
pinecone_key = os.getenv("PINECONE_API_KEY")
if not github_token: raise ValueError("GITHUB_TOKEN missing")
if not pinecone_key: raise ValueError("PINECONE_API_KEY missing")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

client = OpenAI(base_url="https://models.inference.ai.azure.com", api_key=github_token)
pc     = Pinecone(api_key=pinecone_key)
index  = pc.Index("campus-copilot")

class ChatRequest(BaseModel):
    message: str
    user_id: str
    history: Optional[List[Dict[str, str]]] = []
    role:    Optional[str] = "student"

# ─── Campus Data ───────────────────────────────────────────────────────────────
MOCK_ATTENDANCE = [
    {"code":"MAT 2201","name":"Probability and Optimization",           "attended":38,"total":45,"percent":84},
    {"code":"CSS 2201","name":"Database Systems",                        "attended":29,"total":42,"percent":69},
    {"code":"CSS 2202","name":"Design & Analysis of Algorithms",         "attended":40,"total":44,"percent":91},
    {"code":"CSS 2203","name":"Introduction to Artificial Intelligence", "attended":31,"total":43,"percent":72},
    {"code":"CSS 2204","name":"Operating Systems",                       "attended":22,"total":24,"percent":92},
]
MOCK_GRADES = {"cgpa":8.4,"semester_gpa":8.7,"subjects":[
    {"code":"MAT 2201","name":"Probability and Optimization",           "grade":"A", "points":9, "marks":78},
    {"code":"CSS 2201","name":"Database Systems",                        "grade":"B+","points":8, "marks":71},
    {"code":"CSS 2202","name":"Design & Analysis of Algorithms",         "grade":"A+","points":10,"marks":91},
    {"code":"CSS 2203","name":"Introduction to Artificial Intelligence", "grade":"B", "points":7, "marks":65},
    {"code":"CSS 2204","name":"Operating Systems",                       "grade":"A", "points":9, "marks":82},
]}
MOCK_EXAM_SCHEDULE = [
    {"code":"MAT 2201","subject":"Probability and Optimization",           "date":"2026-03-06","time":"8:30–10:00 AM","hall":"ELH-1"},
    {"code":"CSS 2201","subject":"Database Systems",                        "date":"2026-03-07","time":"8:30–10:00 AM","hall":"ELH-2"},
    {"code":"CSS 2202","subject":"Design & Analysis of Algorithms",         "date":"2026-03-09","time":"8:30–10:00 AM","hall":"ELH-1"},
    {"code":"CSS 2203","subject":"Introduction to Artificial Intelligence", "date":"2026-03-10","time":"8:30–10:00 AM","hall":"LH-301"},
    {"code":"CSS 2204","subject":"Operating Systems",                       "date":"2026-03-11","time":"8:30–10:00 AM","hall":"LH-302"},
]
MOCK_TIMETABLE = {
    "Monday":   [{"time":"08:00–09:00","subject":"Probability & Optimization","room":"LH-301","type":"lecture"},{"time":"09:00–10:00","subject":"Database Systems","room":"LH-204","type":"lecture"},{"time":"10:15–11:15","subject":"Design & Analysis of Algo","room":"LH-102","type":"lecture"},{"time":"11:30–13:30","subject":"OS Lab","room":"OSDL-B","type":"lab"},{"time":"14:30–15:30","subject":"Operating Systems","room":"LH-301","type":"lecture"}],
    "Tuesday":  [{"time":"08:00–09:00","subject":"Intro to AI","room":"LH-205","type":"lecture"},{"time":"09:00–10:00","subject":"Operating Systems","room":"LH-301","type":"lecture"},{"time":"11:00–13:00","subject":"DBMS Lab","room":"LAB-4","type":"lab"},{"time":"14:00–15:00","subject":"Probability & Optimization","room":"LH-102","type":"lecture"}],
    "Wednesday":[{"time":"08:00–09:00","subject":"Database Systems","room":"LH-204","type":"lecture"},{"time":"09:15–10:15","subject":"Design & Analysis of Algo","room":"LH-102","type":"lecture"},{"time":"10:30–11:30","subject":"Intro to AI","room":"LH-205","type":"lecture"},{"time":"14:00–15:00","subject":"Operating Systems","room":"LH-301","type":"lecture"}],
    "Thursday": [{"time":"08:00–09:00","subject":"Probability & Optimization","room":"LH-301","type":"lecture"},{"time":"10:00–12:00","subject":"Algorithms Lab","room":"CC-3","type":"lab"},{"time":"13:00–14:00","subject":"Database Systems","room":"LH-204","type":"lecture"},{"time":"14:00–15:00","subject":"Intro to AI","room":"LH-205","type":"lecture"}],
    "Friday":   [{"time":"08:00–09:00","subject":"Design & Analysis of Algo","room":"LH-102","type":"lecture"},{"time":"09:00–10:00","subject":"Operating Systems","room":"LH-301","type":"lecture"},{"time":"10:15–11:15","subject":"Intro to AI","room":"LH-205","type":"lecture"}],
    "Saturday": [{"time":"08:00–09:00","subject":"Database Systems","room":"LH-204","type":"lecture"},{"time":"09:00–10:00","subject":"Probability & Optimization","room":"LH-102","type":"lecture"}],
    "Sunday":   [],
}
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
    {"id":3,"title":"Placement Drive: TCS – March 18","category":"placement","date":"2026-03-03","detail":"Eligible: CGPA ≥ 7.0, no backlogs. Register by March 14."},
    {"id":4,"title":"Hostel Maintenance – Block C, March 15–16","category":"hostel","date":"2026-03-02","detail":"Hot water unavailable."},
    {"id":5,"title":"Sports Day Registration Open","category":"event","date":"2026-03-01","detail":"Register at Sports Office before March 10."},
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

def exec_att(a,uid):
    code=a.get("subject_code")
    recs=[r for r in MOCK_ATTENDANCE if not code or r["code"]==code]
    enr=[{**r,
          "can_bunk":max(0,int((r["attended"]-0.75*r["total"])/0.75)) if r["percent"]>=75 else 0,
          "need_to_attend":max(0,int((0.75*r["total"]-r["attended"])/0.25)+1) if r["percent"]<75 else 0,
          "safe":r["percent"]>=75} for r in recs]
    return {"student":"Aman Mehta","semester":4,"records":enr}

def exec_grades(a,uid): return {"student":"Aman Mehta",**MOCK_GRADES}
def exec_exams(a,uid): return {"student":"Aman Mehta","type":"IV Sem Midterm","time":"8:30 AM – 10:00 AM","exams":MOCK_EXAM_SCHEDULE}

def exec_tt(a,uid):
    day=a.get("day","today")
    if day=="today": day=datetime.datetime.now().strftime("%A")
    elif day=="tomorrow": day=(datetime.datetime.now()+datetime.timedelta(days=1)).strftime("%A")
    day=day.capitalize()
    return {"student":"Aman Mehta","day":day,"classes":MOCK_TIMETABLE.get(day,[])}

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
    "book_lab_slot":                  {"fn":exec_book,    "nu":True, "at":"tool_interaction",   "r":lambda a:f"Here's the lab access request for **{a.get('lab_name')}**:"},
    "check_lab_availability":         {"fn":exec_avail,   "nu":False,"at":"lab_availability",   "r":lambda a:f"Here's the availability for **{a.get('lab_name')}**:"},
    "cancel_lab_booking":             {"fn":exec_cancel,  "nu":True, "at":"cancel_booking",     "r":lambda a:"Your lab request has been cancelled."},
    "get_attendance":                 {"fn":exec_att,     "nu":True, "at":"attendance_report",  "r":lambda a:"Here's your attendance this semester:"},
    "get_attendance_bunk_calculator": {"fn":exec_att,     "nu":True, "at":"attendance_report",  "r":lambda a:"Here's your attendance breakdown:"},
    "get_grades":                     {"fn":exec_grades,  "nu":True, "at":"grades_report",      "r":lambda a:"Here are your grades:"},
    "get_exam_schedule":              {"fn":exec_exams,   "nu":True, "at":"exam_schedule",      "r":lambda a:"Here's your IV Sem Midterm schedule:"},
    "get_timetable":                  {"fn":exec_tt,      "nu":True, "at":"timetable",          "r":lambda a:f"Here's your schedule for **{a.get('day','today')}**:"},
    "get_fee_status":                 {"fn":exec_fees,    "nu":True, "at":"fee_status",         "r":lambda a:"Here's your current fee status:"},
    "raise_grievance":                {"fn":exec_griev,   "nu":True, "at":"grievance_submitted","r":lambda a:f"Your complaint has been submitted under **{a.get('category')}**:"},
    "request_bonafide_certificate":   {"fn":exec_doc,     "nu":True, "at":"document_request",   "r":lambda a:f"Your **{a.get('document_type','document')}** request has been submitted:"},
    "get_mess_menu":                  {"fn":exec_mess,    "nu":False,"at":"mess_menu",          "r":lambda a:f"Here's the mess menu for **{a.get('day','today')}**:"},
    "get_campus_notices":             {"fn":exec_notices, "nu":False,"at":"campus_notices",     "r":lambda a:"Here are the latest campus notices:"},
}

# ─── Format tool results as markdown ──────────────────────────────────────────
def fmt(at,res,args):
    if at=="attendance_report":
        rows=res.get("records",[])
        out="\n\n| Subject | Attended | Total | % | Status |\n|---|---|---|---|---|\n"
        for r in rows:
            out+=f"| {r['name']} | {r['attended']} | {r['total']} | {r['percent']}% | {'✅ Safe' if r['safe'] else '⚠️ At risk'} |\n"
        return out
    elif at=="grades_report":
        out=f"\n\n**CGPA: {res['cgpa']}** | Semester GPA: {res['semester_gpa']}\n\n"
        for s in res["subjects"]: out+=f"- **{s['code']}** {s['name']}: **{s['grade']}** ({s['marks']}/100)\n"
        return out
    elif at=="exam_schedule":
        out="\n\n| Subject | Code | Date | Venue |\n|---|---|---|---|\n"
        for e in res["exams"]: out+=f"| {e['subject']} | {e['code']} | {e['date']} | {e['hall']} |\n"
        return out+f"\n_Timing: {res['time']}_"
    elif at=="timetable":
        cl=res.get("classes",[])
        return "\n\nNo classes scheduled." if not cl else "\n\n"+"".join(f"- **{c['time']}** — {c['subject']} · {c['room']} _{c['type']}_\n" for c in cl)
    elif at=="fee_status":
        out=f"\n\n**Total outstanding: ₹{res['total_outstanding']:,}**\n\n"
        for d in res["dues"]: out+=f"{'🔴' if d['status']=='Overdue' else '🟡' if d['status']=='Pending' else '✅'} **{d['category']}**: ₹{d['amount']:,} — {d['status']} (due {d['due_date']})\n"
        return out
    elif at=="mess_menu": return "\n\n"+"".join(f"**{m.capitalize()}**: {i}\n\n" for m,i in res.get("menu",{}).items())
    elif at=="campus_notices": return "\n\n"+"".join(f"**{n['title']}** _{n['date']}_\n{n.get('detail','')}\n\n" for n in res.get("notices",[]))
    elif at=="lab_availability": return "\n\n"+"".join(f"{'✅' if s=='Available' else '🔴'} **{sl.capitalize()}**: {s}\n" for sl,s in res.get("slots",{}).items())
    elif at=="grievance_submitted": return f"\n\nTicket ID: **{res.get('ticket_id')}** · Expected response: {res.get('expected_response')}"
    elif at=="document_request": return f"\n\nRequest ID: **{res.get('request_id')}** · Ready in: {res.get('ready_in')}"
    return ""

def sse(event,data): return f"event: {event}\ndata: {json.dumps(data)}\n\n"

def build_system(role, context):
    # Always inject today's real date so the model can answer date questions
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
            # Step 1: RAG search
            yield sse("rag_start", {})
            await asyncio.sleep(0)
            emb     = client.embeddings.create(input=req.message, model="text-embedding-3-small")
            results = index.query(vector=emb.data[0].embedding, top_k=3, include_metadata=True)
            context = ""; sources = []
            for m in results.get("matches",[]):
                if "metadata" in m and "text" in m["metadata"] and m.get("score",0) > 0.5:
                    context += m["metadata"]["text"]+"\n\n"
                    sources.append({"text":m["metadata"]["text"][:150]+"…","score":round(m.get("score",0),3)})
            # Only send sources if they're actually relevant (score > 0.3)
            if sources:
                yield sse("rag", {"sources": sources})
            await asyncio.sleep(0)

            # Step 2: Build messages
            sys_prompt = build_system(req.role, context)
            messages   = [{"role":"system","content":sys_prompt}]
            for m in req.history:
                if m.get("role") in ["user","assistant"]:
                    messages.append({"role":m["role"],"content":m["content"]})
            messages.append({"role":"user","content":req.message})

            # Step 3: Single LLM call with tools (no separate probe)
            # Use a non-streaming call first to detect tool use, then stream if no tool
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
                # Tool path — execute and stream the formatted reply
                tc        = tool_calls[0]
                tool_name = tc.function.name
                args      = json.loads(tc.function.arguments)
                print(f"  [TOOL] {tool_name} | {args}")

                d = DISPATCH.get(tool_name)
                if not d:
                    yield sse("error",{"message":"Unknown tool called."}); return

                result      = d["fn"](args, req.user_id) if d["nu"] else d["fn"](args)
                action_type = d["at"]
                reply_text  = d["r"](args) + fmt(action_type, result, args)

                # Stream the reply character by character for visual effect
                for char in reply_text:
                    yield sse("token",{"text":char})
                    full_text += char
                    await asyncio.sleep(0.002)

                # Send the action card data
                yield sse("action",{
                    "type":      action_type,
                    "tool_name": tool_name,
                    "status":    "Pending Confirmation" if action_type == "tool_interaction" else "Success",
                    "details":   {**args, **result},
                })

            elif msg_obj.content:
                # Plain answer path — the model already answered, stream it token by token
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
            result=d["fn"](args,req.user_id) if d["nu"] else d["fn"](args); at=d["at"]
            return {"reply":d["r"](args)+fmt(at,result,args),
                    "action":{"type":at,"tool_name":tname,"status":"Pending Confirmation" if at=="tool_interaction" else "Success","details":{**args,**result}}}
        return {"reply":msg.content,"action":None}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"reply":"I hit a snag. Please try again.","action":None}

if __name__=="__main__":
    import uvicorn; uvicorn.run(app,host="0.0.0.0",port=8000)