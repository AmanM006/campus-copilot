// hooks/useSyncStatus.ts
// ─── Polls /api/session-status + listens for realtime sync_complete ───────────
// FIX: syncing is STRICTLY false when status === 'active', no exceptions.

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type SyncStatus =
  | "none" | "pending" | "active" | "expired" | "needs_reauth" | "syncing";

export interface SyncState {
  status:      SyncStatus;
  hasData:     boolean;
  lastSynced:  string | null;
  syncing:     boolean;       // ONLY true for pending / syncing
  needsReauth: boolean;
  triggerSync: () => Promise<void>;
}

const PENDING_STATUSES: SyncStatus[] = ["pending", "syncing"];

export function useSyncStatus(email: string): SyncState {
  const [status,     setStatus]     = useState<SyncStatus>("none");
  const [hasData,    setHasData]    = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const mountedRef   = useRef(true);
  const pollRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // track the latest status in a ref so the poll scheduler always sees it
  const statusRef    = useRef<SyncStatus>("none");

  // ── Fetch from API ────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!email || !mountedRef.current) return;
    try {
      const res = await fetch(
        `/api/session-status?email=${encodeURIComponent(email)}`
      );
      if (!res.ok || !mountedRef.current) return;
      const d = await res.json();

      const s = (d.session_status ?? "none") as SyncStatus;
      statusRef.current = s;
      setStatus(s);
      setLastSynced(d.last_synced ?? null);

      // hasData is true if API says so OR if session is active with a timestamp
      setHasData(!!(d.has_data || (s === "active" && d.last_synced)));
    } catch { /* ignore */ }
  }, [email]);

  // ── Poll scheduler ────────────────────────────────────────────────────────
  // Re-runs whenever fetchStatus identity changes (i.e. email changes).
  useEffect(() => {
    mountedRef.current = true;
    fetchStatus(); // immediate first fetch

    function scheduleNext() {
      if (!mountedRef.current) return;
      const isPending = PENDING_STATUSES.includes(statusRef.current);
      const isActive  = statusRef.current === "active";
      const delay     = isPending ? 3_000 : isActive ? 60_000 : 10_000;

      pollRef.current = setTimeout(async () => {
        await fetchStatus();
        scheduleNext(); // always re-schedule
      }, delay);
    }
    scheduleNext();

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchStatus]);

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!email) return;
    const key = email.replace(/[@.]/g, "_");
    const ch  = supabase
      .channel(`sync_evt_${key}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sync_events" },
        (payload) => {
          if (
            payload.new?.user_email === email &&
            payload.new?.event === "sync_complete" &&
            mountedRef.current
          ) {
            fetchStatus();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [email, fetchStatus]);

  // ── Manual trigger ────────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (!email) return;
    setStatus("syncing");
    statusRef.current = "syncing";
    try {
      await fetch("/api/auto-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
    } catch { /* ignore */ }
    setTimeout(fetchStatus, 1_500);
  }, [email, fetchStatus]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // KEY FIX: syncing is NEVER true when status is 'active'
  const syncing = status !== "active" && PENDING_STATUSES.includes(status);

  return {
    status,
    hasData,
    lastSynced,
    syncing,
    needsReauth: status === "needs_reauth",
    triggerSync,
  };
}