// lib/agent.ts
// ─── Multi-agent system for CampusCopilot ─────────────────────────────────────
// Simulates a headless browser agent that can operate college portals.
// In production, replace simulate* functions with Playwright/Puppeteer calls.

export type AgentStep = {
    id:      number;
    label:   string;
    status:  "pending" | "running" | "done" | "error";
    detail?: string;
  };
  
  export type AgentResult = {
    success: boolean;
    data?:   any;
    error?:  string;
    steps:   AgentStep[];
  };
  
  export type WorkflowAction =
    | "fetch_attendance"
    | "fetch_grades"
    | "book_lab"
    | "upload_notes"
    | "fetch_timetable"
    | "fill_form";
  
  export interface AgentContext {
    college_id:  string;
    portal_url:  string;
    username?:   string;
    password?:   string;
    action:      WorkflowAction;
    params?:     Record<string, any>;
    workflow?:   AgentWorkflow | null;
  }
  
  export interface AgentWorkflow {
    id:          string;
    college_id:  string;
    action_name: string;
    steps:       WorkflowStep[];
    created_at:  string;
  }
  
  export interface WorkflowStep {
    order:       number;
    type:        "navigate" | "click" | "fill" | "extract" | "wait" | "scroll";
    selector?:   string;
    value?:      string;
    description: string;
  }
  
  // ── Simulated portal data (replace with real scraping) ────────────────────────
  const SIMULATED_DATA: Record<WorkflowAction, (params?: Record<string, any>) => any> = {
    fetch_attendance: () => ({
      student: "Aman Mehta",
      records: [
        { subject: "Database Systems",   percent: 69, attended: 29, total: 42 },
        { subject: "Operating Systems",  percent: 92, attended: 22, total: 24 },
        { subject: "Intro to AI",        percent: 72, attended: 31, total: 43 },
        { subject: "DAA",                percent: 91, attended: 40, total: 44 },
        { subject: "Probability & Opt.", percent: 84, attended: 38, total: 45 },
      ],
    }),
    fetch_grades: () => ({
      cgpa: 8.4, semester_gpa: 8.7,
      subjects: [
        { code: "CSS 2201", grade: "B+", marks: 71 },
        { code: "CSS 2202", grade: "A+", marks: 91 },
        { code: "CSS 2203", grade: "B",  marks: 65 },
        { code: "CSS 2204", grade: "A",  marks: 82 },
        { code: "MAT 2201", grade: "A",  marks: 78 },
      ],
    }),
    book_lab:      (p) => ({ booked: true, lab: p?.lab, date: p?.date, slot: p?.slot, ref: `LAB-${Math.random().toString(36).slice(2,8).toUpperCase()}` }),
    upload_notes:  (p) => ({ uploaded: true, file: p?.filename, url: `https://cdn.example.com/${p?.filename}` }),
    fetch_timetable: () => ({
      today: [
        { time: "09:00", subject: "Database Systems", room: "LH-204" },
        { time: "11:00", subject: "DBMS Lab",         room: "LAB-4"  },
      ],
    }),
    fill_form: (p) => ({ submitted: true, form: p?.form_name, ref: `FORM-${Date.now()}` }),
  };
  
  // ── Step templates per action ──────────────────────────────────────────────────
  const STEP_TEMPLATES: Record<WorkflowAction, string[]> = {
    fetch_attendance: [
      "Opening college portal",
      "Authenticating credentials",
      "Navigating to student dashboard",
      "Locating attendance section",
      "Extracting attendance data",
      "Parsing subject-wise records",
      "Syncing with CampusCopilot",
    ],
    fetch_grades: [
      "Opening college portal",
      "Authenticating credentials",
      "Navigating to academic section",
      "Loading grade report",
      "Extracting subject grades",
      "Calculating GPA",
      "Syncing with CampusCopilot",
    ],
    book_lab: [
      "Opening lab booking portal",
      "Authenticating credentials",
      "Navigating to lab scheduler",
      "Checking slot availability",
      "Filling booking form",
      "Submitting request",
      "Confirming booking reference",
    ],
    upload_notes: [
      "Opening faculty portal",
      "Authenticating credentials",
      "Navigating to subject materials",
      "Preparing file upload",
      "Uploading to portal",
      "Confirming upload success",
      "Notifying enrolled students",
    ],
    fetch_timetable: [
      "Opening college portal",
      "Authenticating credentials",
      "Navigating to timetable section",
      "Extracting weekly schedule",
      "Syncing with CampusCopilot",
    ],
    fill_form: [
      "Opening form portal",
      "Authenticating credentials",
      "Navigating to form",
      "Auto-filling fields",
      "Reviewing form data",
      "Submitting form",
      "Collecting confirmation",
    ],
  };
  
  // ── Delay helper ──────────────────────────────────────────────────────────────
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  
  // ── Core agent runner ─────────────────────────────────────────────────────────
  export async function runAgent(
    ctx: AgentContext,
    onStep: (step: AgentStep) => void,
  ): Promise<AgentResult> {
    const templates = STEP_TEMPLATES[ctx.action];
    const steps: AgentStep[] = templates.map((label, i) => ({
      id: i, label, status: "pending",
    }));
  
    // Emit initial state
    steps.forEach(s => onStep(s));
  
    // Execute each step with simulated timing
    for (let i = 0; i < steps.length; i++) {
      steps[i] = { ...steps[i], status: "running" };
      onStep(steps[i]);
  
      // Simulate realistic step durations
      const stepMs = i === 0 ? 600 : i === 1 ? 900 : 400 + Math.random() * 300;
      await delay(stepMs);
  
      steps[i] = { ...steps[i], status: "done", detail: getStepDetail(ctx.action, i) };
      onStep(steps[i]);
    }
  
    // Return extracted data
    const dataFn = SIMULATED_DATA[ctx.action];
    const data   = dataFn ? dataFn(ctx.params) : {};
  
    return { success: true, data, steps };
  }
  
  // ── Streaming agent runner (yields steps over time) ───────────────────────────
  export async function* streamAgent(ctx: AgentContext): AsyncGenerator<AgentStep | { type: "result"; data: any }> {
    const templates = STEP_TEMPLATES[ctx.action];
  
    for (let i = 0; i < templates.length; i++) {
      yield { id: i, label: templates[i], status: "running" as const };
      await delay(i === 0 ? 600 : i === 1 ? 900 : 350 + Math.random() * 250);
      yield { id: i, label: templates[i], status: "done" as const, detail: getStepDetail(ctx.action, i) };
    }
  
    const dataFn = SIMULATED_DATA[ctx.action];
    yield { type: "result", data: dataFn ? dataFn(ctx.params) : {} };
  }
  
  function getStepDetail(action: WorkflowAction, stepIndex: number): string {
    const details: Record<WorkflowAction, Record<number, string>> = {
      fetch_attendance: {
        0: "portal.manipal.edu → 200 OK",
        1: "Session established",
        2: "/student/dashboard → loaded",
        3: "/student/attendance → found",
        5: "5 subjects · 20 records parsed",
      },
      fetch_grades: {
        0: "portal.manipal.edu → 200 OK",
        1: "Session established",
        4: "5 subjects · GPA computed",
      },
      book_lab: {
        3: "Robotics Lab → 2 slots available",
        5: "Request submitted",
        6: "Reference ID generated",
      },
      upload_notes: {
        4: "File transferred · 100%",
        5: "Upload confirmed",
        6: "10 students notified",
      },
      fetch_timetable: {
        3: "7 days · 32 classes extracted",
      },
      fill_form: {
        3: "8 fields auto-filled",
        5: "Form submitted · 200 OK",
      },
    };
    return details[action]?.[stepIndex] || "";
  }
  
  // ── College system detection ───────────────────────────────────────────────────
  export function detectPortalType(url: string): string {
    if (url.includes("slcm")) return "SLCM";
    if (url.includes("erp"))  return "ERP System";
    if (url.includes("moodle")) return "Moodle";
    if (url.includes("manipal")) return "Manipal Portal";
    return "Custom Portal";
  }
  
  // ── Workflow storage helpers ───────────────────────────────────────────────────
  import { supabase } from "./supabase";
  
  export async function saveWorkflow(workflow: Omit<AgentWorkflow, "id" | "created_at">) {
    const { data, error } = await supabase
      .from("agent_workflows")
      .insert(workflow)
      .select()
      .single();
    if (error) throw error;
    return data as AgentWorkflow;
  }
  
  export async function getWorkflow(collegeId: string, actionName: string) {
    const { data } = await supabase
      .from("agent_workflows")
      .select("*")
      .eq("college_id", collegeId)
      .eq("action_name", actionName)
      .maybeSingle();
    return data as AgentWorkflow | null;
  }
  
  export async function logAgentRun(log: {
    college_id: string; action: string; status: string;
    steps: AgentStep[]; result?: any;
  }) {
    await supabase.from("agent_logs").insert({
      college_id: log.college_id,
      action:     log.action,
      status:     log.status,
      steps:      log.steps,
      result:     log.result,
      ran_at:     new Date().toISOString(),
    }).then(() => {});
  }