// ═══════════════════════════════════════════════════════════════════════
// INVOICES — manual bookkeeping only. No payment gateway wired yet — see
// CoachMe Bible Vol 2, Module 11 for the Razorpay integration plan.
// "Mark Paid" is a manual toggle, not a real payment confirmation.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName } from "../lib/utils.js";
import { Card, Badge, Btn, Input, Sel, Modal, Empty, ST, SC } from "../components/ui.jsx";

export default function InvoicesPage() {
  const [inv, setInv] = useState(ls.get("invoices", []));
  const [showAdd, setShowAdd] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ clientId: "", amount: "", description: "", dueDate: "" });

  useEffect(() => { api.get("/clients").then(d => setClients(unwrap(d, "clients"))).catch(() => {}); }, []);

  const save = () => {
    const cl = clients.find(c => c.id === form.clientId);
    const e = { ...form, id: Date.now(), clientName: cl?.name || cl?.user?.name || "Client", date: new Date().toISOString().slice(0, 10), amount: +form.amount, status: "pending" };
    const u = [...inv, e]; setInv(u); ls.set("invoices", u); setShowAdd(false); setForm({ clientId: "", amount: "", description: "", dueDate: "" });
  };
  const markPaid = id => { const u = inv.map(i => i.id === id ? { ...i, status: "paid" } : i); setInv(u); ls.set("invoices", u); };

  const tp = inv.filter(i => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const tc = inv.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      <ST right={<Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Invoice</Btn>}>Invoices</ST>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <SC label="Pending" value={`₹${tp.toLocaleString()}`} icon="⏳" color={C.wn} />
        <SC label="Collected" value={`₹${tc.toLocaleString()}`} icon="✅" color={C.ok} />
      </div>
      {inv.length === 0 ? <Empty icon="🧾" text="No invoices" /> : inv.slice().reverse().map(i => (
        <Card key={i.id} style={{ padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{i.clientName}</div><div style={{ fontSize: 12, color: C.mt }}>{i.description} · {i.date}</div></div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>₹{i.amount.toLocaleString()}</div>
            {i.status === "pending" ? <button onClick={() => markPaid(i.id)} style={{ padding: "3px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: C.ok + "20", color: C.ok, marginTop: 4 }}>Mark Paid</button> : <Badge color={C.ok}>Paid</Badge>}
          </div>
        </Card>
      ))}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Invoice">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.length > 0 && <Sel label="Client" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={[{ value: "", label: "— Select —" }, ...clients.map(c => ({ value: c.id, label: cName(c) }))]} />}
          <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Monthly coaching - March" />
          <Input label="Due Date" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%" }}>Create</Btn>
        </div>
      </Modal>
    </div>
  );
}
