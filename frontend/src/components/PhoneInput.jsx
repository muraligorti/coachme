// ═══════════════════════════════════════════════════════════════════════
// PHONE INPUT — a select-country-code + number field, used on
// registration and profile forms. Kept separate from ui.jsx since
// COUNTRY_CODES is a meaningfully large, self-contained data table.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";

export const COUNTRY_CODES = [
  { code: "+91", flag: "🇮🇳", name: "India" }, { code: "+1", flag: "🇺🇸", name: "US" }, { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+61", flag: "🇦🇺", name: "Australia" }, { code: "+880", flag: "🇧🇩", name: "Bangladesh" }, { code: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "+1", flag: "🇨🇦", name: "Canada" }, { code: "+86", flag: "🇨🇳", name: "China" }, { code: "+20", flag: "🇪🇬", name: "Egypt" },
  { code: "+33", flag: "🇫🇷", name: "France" }, { code: "+49", flag: "🇩🇪", name: "Germany" }, { code: "+62", flag: "🇮🇩", name: "Indonesia" },
  { code: "+353", flag: "🇮🇪", name: "Ireland" }, { code: "+972", flag: "🇮🇱", name: "Israel" }, { code: "+39", flag: "🇮🇹", name: "Italy" },
  { code: "+81", flag: "🇯🇵", name: "Japan" }, { code: "+254", flag: "🇰🇪", name: "Kenya" }, { code: "+60", flag: "🇲🇾", name: "Malaysia" },
  { code: "+52", flag: "🇲🇽", name: "Mexico" }, { code: "+977", flag: "🇳🇵", name: "Nepal" }, { code: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "+92", flag: "🇵🇰", name: "Pakistan" }, { code: "+63", flag: "🇵🇭", name: "Philippines" }, { code: "+7", flag: "🇷🇺", name: "Russia" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" }, { code: "+65", flag: "🇸🇬", name: "Singapore" }, { code: "+27", flag: "🇿🇦", name: "South Africa" },
  { code: "+82", flag: "🇰🇷", name: "South Korea" }, { code: "+94", flag: "🇱🇰", name: "Sri Lanka" }, { code: "+971", flag: "🇦🇪", name: "UAE" },
];

export const PhoneInput = ({ label, value, onChange, placeholder }) => {
  const detectCode = () => { for (const c of COUNTRY_CODES) { if (value && value.startsWith(c.code)) return c.code; } return "+91"; };
  const [cc, setCc] = useState(detectCode);
  const numOnly = (value || "").replace(/^\+\d+\s*/, "");
  const handleCodeChange = (e) => { const newCc = e.target.value; setCc(newCc); onChange({ target: { value: newCc + " " + numOnly } }); };
  const handleNumChange = (e) => { const num = e.target.value.replace(/[^\d\s]/g, ""); onChange({ target: { value: cc + " " + num } }); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {label && <label style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>{label}</label>}
      <div style={{ display: "flex", gap: 4 }}>
        <select value={cc} onChange={handleCodeChange} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 4px 12px 8px", color: C.tx, fontSize: 13, outline: "none", fontFamily: "inherit", minWidth: 90, cursor: "pointer" }}>
          {COUNTRY_CODES.map((c) => <option key={`${c.code}_${c.name}`} value={c.code}>{c.flag} {c.code}</option>)}
        </select>
        <input value={numOnly} onChange={handleNumChange} placeholder={placeholder || "98765 43210"} style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 16px", color: C.tx, fontSize: 14, outline: "none", fontFamily: "inherit", flex: 1, width: "100%", boxSizing: "border-box" }} />
      </div>
    </div>
  );
};
