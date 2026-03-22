// components/NotificationBell.tsx
// ─── Live notification bell for both faculty and student dashboards ────────────

"use client";
import React, { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useData";
import type { DBNotification } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  info:    "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  error:   "#ef4444",
};

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const { notifications, unreadCount, markRead } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(p => !p);
    if (!open && unreadCount > 0) markRead();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        style={{
          position: "relative", background: "transparent",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.5)", padding: "5px 8px",
          borderRadius: 8, cursor: "pointer", display: "flex",
          alignItems: "center", gap: 5, transition: "all 0.2s",
        }}
        onMouseOver={e => (e.currentTarget.style.color = "#fff")}
        onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}>
        <Bell size={14} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", color: "#fff",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 320, background: "#0f0f14",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14, zIndex: 200, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}>
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Notifications</div>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 10, color: "#0ea5e9",
                background: "rgba(14,165,233,0.1)", padding: "2px 8px", borderRadius: 100,
              }}>{unreadCount} new</span>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "20px", fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                No notifications yet
              </div>
            ) : notifications.map((n: DBNotification) => (
              <div key={n.id} style={{
                padding: "10px 14px",
                background: n.read ? "transparent" : "rgba(255,255,255,0.02)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                borderLeft: `2px solid ${n.read ? "transparent" : TYPE_COLORS[n.type]}`,
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                    background: n.read ? "rgba(255,255,255,0.15)" : TYPE_COLORS[n.type],
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}