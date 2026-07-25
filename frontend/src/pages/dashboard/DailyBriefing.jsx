// ═══════════════════════════════════════════════════════════════════════
// DAILY BRIEFING — the proactive-AI "second brain" card on Home. Pulls
// from GET /api/insights/briefing (see backend services/insightsService.js).
// Deliberately sparse (max 5 items server-side) and treats "all clear" as
// a valid, positively-framed outcome, not an error state.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";

export default function DailyBriefing({ onNav }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { api.get("/insights/briefing").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);

  if (loading || !data || dismissed) return null;
  const allClear = !data.items || data.items.length === 0;
  const iconFor = (t) => t === "client_risk" ? "⚠️" : t === "cold_leads" ? "🧊" : t === "capacity" ? "📈" : "💡";
  const bgFor = (t) => t === "client_risk" ? C.wn + "20" : t === "cold_leads" ? C.a2 + "20" : C.ok + "20";
  const goTo = (item) => { if (!onNav) return; if (item.action?.nav) onNav(item.action.nav); };

  return (
    <div style={{ borderRadius: 20, padding: 2, background: C.gr, marginBottom: 16 }}>
      <div style={{ background: C.bg, borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, background: C.gr, color: "#fff", padding: "3px 8px", borderRadius: 20 }}>AI</span>
          <span style={{ color: C.tx, fontSize: 15, fontWeight: 700 }}>Today's Briefing</span>
        </div>
        {allClear ? (
          <div style={{ textAlign: "center", padding: "18px 8px 4px" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
            <div style={{ color: C.tx, fontSize: 14, fontWeight: 700, marginBottom: 3 }}>All clear today</div>
            <div style={{ color: C.mt, fontSize: 12 }}>No clients need attention, no cold leads, nothing urgent.</div>
          </div>
        ) : (
          <>
            <div style={{ color: C.mt, fontSize: 12, margin: "2px 0 12px" }}>{data.items.length} thing{data.items.length !== 1 ? "s" : ""} worth a look today</div>
            {data.items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: i > 0 ? `1px solid ${C.bd}` : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: bgFor(item.type), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{item.icon || iconFor(item.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.tx, fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{item.headline}</div>
                  <div style={{ color: C.mt, fontSize: 11.5, marginTop: 2 }}>{item.why}</div>
                  {item.action && <button onClick={() => goTo(item)} style={{ marginTop: 6, background: C.s2, color: C.a2, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer" }}>{item.action.label}</button>}
                </div>
              </div>
            ))}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
          <span style={{ color: C.mt, fontSize: 9.5, opacity: .8 }}>Reviewed before it reaches you — nothing sends without your OK</span>
          <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: C.mt, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
