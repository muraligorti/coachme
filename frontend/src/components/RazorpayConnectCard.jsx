// ═══════════════════════════════════════════════════════════════════════
// RAZORPAY CONNECTION — each coach connects their OWN Razorpay account.
// Money flows directly from client to coach through it; this platform
// never touches it, never sees the Key Secret in plaintext again once
// saved (it's encrypted server-side), and this UI never receives it back
// either — only a connected/disconnected status.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Btn, Input } from "./ui.jsx";

export default function RazorpayConnectCard() {
  const [status, setStatus] = useState(null);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.get("/invoices/razorpay/status").then(setStatus).catch(() => setStatus({ connected: false })); }, []);

  const connect = async () => {
    if (!keyId.trim() || !keySecret.trim()) { setError("Both Key ID and Key Secret are required"); return; }
    setSaving(true); setError("");
    try {
      const r = await api.put("/invoices/razorpay/keys", { keyId: keyId.trim(), keySecret: keySecret.trim() });
      setStatus({ connected: r.connected, razorpayKeyId: keyId.trim() });
      setKeyId(""); setKeySecret("");
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Razorpay? You won't be able to generate new payment links until you reconnect.")) return;
    try { await api.del("/invoices/razorpay/keys"); setStatus({ connected: false }); }
    catch (e) { setError(e.message); }
  };

  if (!status) return null;

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>💳 Razorpay</div>
      <div style={{ fontSize: 11, color: C.mt, marginBottom: 14 }}>Connect your own Razorpay account to generate real payment links for invoices. Payments go directly to your account — this app never touches your money or sees your Key Secret again once saved.</div>

      {status.connected ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: C.ok + "15", borderRadius: 10, marginBottom: 10 }}>
            <span style={{ color: C.ok, fontSize: 16 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>Connected</div>
              <div style={{ fontSize: 11, color: C.mt, fontFamily: "monospace" }}>{status.razorpayKeyId}</div>
            </div>
          </div>
          <button onClick={disconnect} style={{ fontSize: 12, color: C.dg, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Disconnect</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Input label="Key ID" value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="rzp_live_xxxxxxxxxxxx" />
          <Input label="Key Secret" type="password" value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder="Your Razorpay Key Secret" />
          <div style={{ fontSize: 10.5, color: C.mt }}>Find these in your Razorpay Dashboard → Settings → API Keys.</div>
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
          <Btn onClick={connect} disabled={saving} style={{ width: "100%" }}>{saving ? "Connecting…" : saved ? "✓ Connected!" : "Connect Razorpay"}</Btn>
        </div>
      )}
    </Card>
  );
}
