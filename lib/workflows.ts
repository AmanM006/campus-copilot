// lib/workflows.ts  (FIXED — uses lib/auth.ts for account creation)
import { registerAdminAccount } from "./auth";

export interface WorkflowStep {
  action:     string;
  label:      string;
  path:       string;
  fieldHint?: string;
}

export interface CollegeWorkflow {
  id?:         string;
  collegeName: string;
  portalUrl:   string;
  system:      string;
  plan:        string;
  actions:     WorkflowStep[];
  adminEmail?: string;
  createdAt:   string;
}

const LS_KEY = "cc_onboarding_workflow";

export function saveWorkflowLocally(wf: CollegeWorkflow) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(wf)); } catch { /* */ }
}

export function loadWorkflowLocally(): CollegeWorkflow | null {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

// Save college + workflows to Supabase
export async function saveWorkflowToSupabase(wf: CollegeWorkflow): Promise<string | null> {
  try {
    const { supabase } = await import("./supabase");

    const { data: src, error: srcErr } = await supabase
      .from("integration_sources")
      .insert({
        college_name: wf.collegeName,
        portal_url:   wf.portalUrl,
        portal_type:  wf.system,
        system_name:  wf.system,
        actions:      wf.actions.map(a => a.action),
        active:       true,
      })
      .select("id")
      .single();

    if (srcErr || !src) { console.error("[saveWorkflow] integration_sources:", srcErr); return null; }

    for (const step of wf.actions) {
      await supabase.from("agent_workflows").insert({
        college_id:  src.id,
        action_name: step.action,
        steps:       [{ path: step.path, label: step.label, hint: step.fieldHint || "" }],
      });
    }
    return src.id;
  } catch (e) { console.error("[saveWorkflow]", e); return null; }
}

// ── Re-export registerAdminAccount so onboarding can import from one place ────
export { registerAdminAccount };