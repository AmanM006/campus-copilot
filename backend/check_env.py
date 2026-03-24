"""
check_env.py — run this before starting the backend to diagnose config issues.
Usage: python check_env.py
"""

import os, sys
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

print("\n── CampusCopilot Environment Check ──────────────────────────\n")

checks = [
    ("GITHUB_TOKEN",            os.getenv("GITHUB_TOKEN"),            "Required for GPT-4o via Azure"),
    ("PINECONE_API_KEY",        os.getenv("PINECONE_API_KEY"),        "Required for RAG"),
    ("SUPABASE_URL",            os.getenv("SUPABASE_URL"),            "Required for DB cache"),
    ("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY"), "⚠️  Must be service_role (not anon) — fixes 401 errors"),
    ("SUPABASE_ANON_KEY",       os.getenv("SUPABASE_ANON_KEY"),       "Used by Next.js frontend"),
]

all_ok = True
for name, value, note in checks:
    if value:
        preview = value[:12] + "..." if len(value) > 12 else value
        print(f"  ✅  {name:<30} = {preview}")
    else:
        print(f"  ❌  {name:<30} MISSING — {note}")
        all_ok = False

print()

# Extra: test Supabase connectivity
sb_url = os.getenv("SUPABASE_URL")
sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
if sb_url and sb_key:
    try:
        from supabase import create_client
        sb = create_client(sb_url, sb_key)
        # Try a simple query
        r = sb.table("cached_attendance").select("user_email").limit(1).execute()
        print(f"  ✅  Supabase connection: OK (cached_attendance table reachable)")
    except Exception as e:
        err = str(e)
        if "401" in err or "Invalid API key" in err:
            print(f"  ❌  Supabase 401 — your SUPABASE_SERVICE_ROLE_KEY is wrong or missing.")
            print(f"      Go to: Supabase Dashboard → Settings → API → service_role (secret)")
        elif "does not exist" in err:
            print(f"  ⚠️   Supabase connected but cached_attendance table missing.")
            print(f"       Run supabase_migration.sql in your Supabase SQL editor.")
        else:
            print(f"  ❌  Supabase error: {err}")
        all_ok = False
else:
    print("  ⏭   Supabase connectivity test skipped (keys missing)")

print()
if all_ok:
    print("  🟢  All checks passed — safe to start: uvicorn main:app --reload\n")
else:
    print("  🔴  Fix the issues above, then re-run this check.\n")
    sys.exit(1)