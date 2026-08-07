// ═══════════════════════════════════════════════════════════════════════
// INVOICES — real, backend-persisted invoices with optional Razorpay
// Payment Link generation. Each coach connects their OWN Razorpay
// account (in Settings); money flows directly to them, this app never
// touches it. Payment confirmation is a manual "Refresh Status" check
// against Razorpay, not a webhook — see backend/services/invoiceService.js
// for why.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { unwrap, cName } from "../lib/utils.js";
import { Card, Badge, Btn, Input, Sel, Modal, Empty, ST, SC, Spin } from "../components/ui.jsx";

const sendWhatsApp = (phone, message) => {
  const cleanPhone = String(phone || "").replace(/[\s\-\+\(\)]/g, "");
  const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : cleanPhone.startsWith("0") ? `91${cleanPhone.slice(1)}` : `91${cleanPhone}`;
  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`, "_blank");
};

export default function InvoicesPage() {
  const [inv, setInv] = useState([]);
  const [loading, setLoading] = useState(true);
  const [razorpay, setRazorpay] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ clientId: "", amount: "", description: "", dueDate: "" });
  const [saveError, setSaveError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/invoices").catch(() => []),
      api.get("/invoices/razorpay/status").catch(() => ({ connected: false })),
      api.get("/clients").catch(() => ({ clients: [] })),
    ]).then(([invoices, rp, cl]) => {
      setInv(invoices || []); setRazorpay(rp); setClients(unwrap(cl, "clients") || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.clientId || !form.amount) { setSaveError("Client and amount are required"); return; }
    setSaveError("");
    try {
      await api.post("/invoices", { clientId: form.clientId, amount: +form.amount, description: form.description, dueDate: form.dueDate || undefined });
      setShowAdd(false); setForm({ clientId: "", amount: "", description: "", dueDate: "" });
      load();
    } catch (e) { setSaveError(e.message); }
  };

  const generateLink = async (id) => {
    setBusyId(id);
    try { const updated = await api.post(`/invoices/${id}/payment-link`); setInv(prev => prev.map(i => i.id === id ? updated : i)); }
    catch (e) { alert(e.message); }
    setBusyId(null);
  };

  const refreshStatus = async (id) => {
    setBusyId(id);
    try { const updated = await api.post(`/invoices/${id}/refresh-status`); setInv(prev => prev.map(i => i.id === id ? updated : i)); }
    catch (e) { alert(e.message); }
    setBusyId(null);
  };

  const markPaid = async (id) => {
    if (!confirm("Mark this invoice as paid manually? Use this for cash or any payment method outside Razorpay.")) return;
    setBusyId(id);
    try { const updated = await api.patch(`/invoices/${id}/mark-paid`); setInv(prev => prev.map(i => i.id === id ? updated : i)); }
    catch (e) { alert(e.message); }
    setBusyId(null);
  };

  const cancelInvoice = async (id) => {
    if (!confirm("Cancel this invoice?")) return;
    setBusyId(id);
    try { const updated = await api.patch(`/invoices/${id}/cancel`); setInv(prev => prev.map(i => i.id === id ? updated : i)); }
    catch (e) { alert(e.message); }
    setBusyId(null);
  };

  const shareInvoice = (i) => {
    const client = clients.find(c => c.id === i.clientId);
    const phone = client?.phone || client?.user?.phone;
    if (!phone) { alert("No phone number on file for this client"); return; }
    const msg = i.razorpayShortUrl
      ? `Hi ${i.clientName}, here's your invoice for ₹${i.amount.toLocaleString()}${i.description ? ` (${i.description})` : ""}. Pay here: ${i.razorpayShortUrl}`
      : `Hi ${i.clientName}, here's your invoice for ₹${i.amount.toLocaleString()}${i.description ? ` (${i.description})` : ""}.`;
    sendWhatsApp(phone, msg);
  };

  if (loading) return <Spin />;

  const tp = inv.filter(i => i.status === "PENDING").reduce((s, i) => s + i.amount, 0);
  const tc = inv.filter(i => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const statusColors = { PENDING: C.wn, PAID: C.ok, CANCELLED: C.mt };

  return (
    <div>
      <ST right={<Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Invoice</Btn>}>Invoices</ST>

      {razorpay && !razorpay.connected && (
        <Card style={{ padding: 12, marginBottom: 12, background: C.wn + "10", border: `1px solid ${C.wn}40` }}>
          <div style={{ fontSize: 12.5, color: C.tx }}>💳 Connect your Razorpay account in Settings to generate real payment links for invoices. You can still create and manually track invoices without it.</div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <SC label="Pending" value={`₹${tp.toLocaleString()}`} icon="⏳" color={C.wn} />
        <SC label="Collected" value={`₹${tc.toLocaleString()}`} icon="✅" color={C.ok} />
      </div>

      {inv.length === 0 ? <Empty icon="🧾" text="No invoices" /> : inv.map(i => (
        <Card key={i.id} style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{i.clientName}</div>
              <div style={{ fontSize: 12, color: C.mt }}>{i.description}{i.description ? " · " : ""}{new Date(i.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>₹{i.amount.toLocaleString()}</div>
              <Badge color={statusColors[i.status]}>{i.status}</Badge>
            </div>
          </div>
          {i.status === "PENDING" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {!i.razorpayShortUrl && razorpay?.connected && (
                <button onClick={() => generateLink(i.id)} disabled={busyId === i.id} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: C.ac + "20", color: C.ac }}>
                  {busyId === i.id ? "…" : "🔗 Generate Payment Link"}
                </button>
              )}
              {i.razorpayShortUrl && (
                <>
                  <button onClick={() => shareInvoice(i)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: "#25D36620", color: "#25D366" }}>📱 Share via WhatsApp</button>
                  <button onClick={() => refreshStatus(i.id)} disabled={busyId === i.id} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: C.s2, color: C.mt }}>{busyId === i.id ? "…" : "↻ Refresh Status"}</button>
                </>
              )}
              <button onClick={() => markPaid(i.id)} disabled={busyId === i.id} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: C.ok + "20", color: C.ok }}>Mark Paid Manually</button>
              <button onClick={() => cancelInvoice(i.id)} disabled={busyId === i.id} style={{ padding: "6px 10px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: C.dg + "15", color: C.dg }}>Cancel</button>
            </div>
          )}
          {i.razorpayShortUrl && i.status === "PENDING" && <div style={{ fontSize: 10.5, color: C.mt, marginTop: 6 }}>{i.razorpayShortUrl}</div>}
        </Card>
      ))}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Invoice">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.length > 0 && <Sel label="Client" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={[{ value: "", label: "— Select —" }, ...clients.map(c => ({ value: c.id, label: cName(c) }))]} />}
          <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Monthly coaching - March" />
          <Input label="Due Date" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
          {saveError && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{saveError}</div>}
          <Btn onClick={save} style={{ width: "100%" }}>Create</Btn>
        </div>
      </Modal>
    </div>
  );
}
