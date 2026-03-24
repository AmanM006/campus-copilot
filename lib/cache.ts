// lib/cache.ts
// ─── In-memory cache with 30-minute TTL ───────────────────────────────────────
// Prevents repeated Supabase calls when switching between dashboard tabs.
// Zero dependencies — plain JS Map with timestamps.

interface CacheEntry<T> {
    data: T;
    ts:   number;          // Date.now() at write time
    ttl:  number;          // milliseconds
  }
  
  class MemCache {
    private store = new Map<string, CacheEntry<any>>();
  
    set<T>(key: string, data: T, ttlMs = 30 * 60 * 1000) {
      this.store.set(key, { data, ts: Date.now(), ttl: ttlMs });
    }
  
    get<T>(key: string): T | null {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > entry.ttl) {
        this.store.delete(key);
        return null;
      }
      return entry.data as T;
    }
  
    invalidate(prefix: string) {
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) this.store.delete(key);
      }
    }
  
    clear() { this.store.clear(); }
  }
  
  // Singleton — shared across all hooks in the same browser tab
  export const cache = new MemCache();
  
  // ── Cache key builders ────────────────────────────────────────────────────────
  export const CK = {
    facultySubjects:   (id: string) => `faculty_subjects:${id}`,
    facultyAttendance: (id: string) => `faculty_attendance:${id}`,
    facultySchedule:   (id: string) => `faculty_schedule:${id}`,
    facultyLabRequests:(id: string) => `faculty_lab:${id}`,
    documents:         (subjectId: string) => `docs:${subjectId}`,
    studentAttendance: (id: string) => `student_att:${id}`,
    studentExams:      (id: string) => `student_exams:${id}`,
    studentSchedule:   (id: string) => `student_schedule:${id}`,
    studentSubjects:   (id: string) => `student_subjects:${id}`,
  };