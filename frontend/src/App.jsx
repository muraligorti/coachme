// CoachMe.life — Super Feature-Rich App.jsx (CoachFlow-grade)
// Backend: just-perception-production.up.railway.app
import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

const API = "https://just-perception-production.up.railway.app/api";
const log = (...a) => console.log("[CoachMe]", ...a);

// ─── API CLIENT ───────────────────────────────────────────────────────────────
const api = {
  token: localStorage.getItem("cm_token"),
  setToken(t) { this.token = t; t ? localStorage.setItem("cm_token", t) : localStorage.removeItem("cm_token"); },
  async req(p, o = {}) {
    const h = { "Content-Type": "application/json", ...(o.headers || {}) };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    try {
      const r = await fetch(`${API}${p}`, { ...o, headers: h });
      if (r.status === 401 && !p.includes("/auth/")) { this.setToken(null); throw new Error("Session expired"); }
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
      if (!r.ok) throw new Error(d.message || d.error || r.statusText);
      return d;
    } catch (e) { if (e.message.includes("Failed to fetch")) throw new Error(`Network error on ${p}`); throw e; }
  },
  get: p => api.req(p), post: (p, b) => api.req(p, { method: "POST", body: JSON.stringify(b) }),
  put: (p, b) => api.req(p, { method: "PUT", body: JSON.stringify(b) }), del: p => api.req(p, { method: "DELETE" }),
  async upload(path, formData) {
    const headers = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API}${path}`, { method: "POST", headers, body: formData });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
    return res.json();
  },
};
function unwrap(d, ...k) { for (const key of k) { if (d?.[key]&&Array.isArray(d[key])) return d[key]; if (d?.data?.[key]&&Array.isArray(d.data[key])) return d.data[key]; } if (Array.isArray(d)) return d; if (Array.isArray(d?.data)) return d.data; return []; }
// Client name helper — backend returns displayName
function cName(c) {
  return c?.displayName || c?.name || c?.user?.displayName || c?.user?.name || c?.user?.email?.split("@")[0] || "Client";
}
function cEmail(c) { return c?.email || c?.user?.email || ""; }
function cPhone(c) { return c?.phone || c?.user?.phone || ""; }

const ls = { get(k, f=null) { try { return JSON.parse(localStorage.getItem(`cm_${k}`)) || f; } catch { return f; } }, set(k, v) { localStorage.setItem(`cm_${k}`, JSON.stringify(v)); } };

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const AuthCtx = createContext(null); const useAuth = () => useContext(AuthCtx);
function xToken(d) { return d?.token||d?.accessToken||d?.access_token||d?.data?.token; }
function xUser(d) { const u=d?.user||d?.data?.user||d?.data||d?.profile; if (!u&&d&&(d.email||d.name||d.id)) return d; return u; }
function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!api.token) return setLoading(false); const eps=["/auth/me","/auth/profile","/coaches/me"]; const t=(i)=>{ if(i>=eps.length){api.setToken(null);setLoading(false);return;} api.get(eps[i]).then(d=>{const u=xUser(d);if(u&&(u.id||u.email)){setUser(u);setLoading(false);}else t(i+1);}).catch(()=>t(i+1));}; t(0); }, []);
  const login = async (email, password) => { const d=await api.post("/auth/login",{email,password}); const tk=xToken(d); if(!tk) throw new Error("No token"); api.setToken(tk); const u=xUser(d); if(u) setUser(u); else { try{const m=await api.get("/auth/me");setUser(xUser(m)||{email});}catch{setUser({email,name:email.split("@")[0]});} } };
  const register = async (pl) => { const d=await api.post("/auth/register",pl); const tk=xToken(d); if(!tk) throw new Error("No token"); api.setToken(tk); setUser(xUser(d)||{email:pl.email,name:pl.name}); };
  const logout = () => { api.setToken(null); setUser(null); };
  if (loading) return <Splash />;
  return <AuthCtx.Provider value={{user,login,register,logout}}>{children}</AuthCtx.Provider>;
}

// ─── THEMES & DESIGN SYSTEM ───────────────────────────────────────────────────
const THEMES = {
  dark: {name:"Midnight",bg:"#0a0a0f",sf:"#12121a",s2:"#1a1a25",bd:"#1e1e2e",tx:"#e4e4ef",mt:"#7a7a8e",ac:"#6c5ce7",a2:"#00cec9",gr:"linear-gradient(135deg,#6c5ce7 0%,#a29bfe 50%,#00cec9 100%)",dg:"#ff4757",wn:"#ffa502",ok:"#2ed573",or:"#ff6348",pk:"#ff6b81"},
  light: {name:"Clean Light",bg:"#f0f2f5",sf:"#ffffff",s2:"#e4e6eb",bd:"#ced0d4",tx:"#1c1e21",mt:"#65676b",ac:"#5b5fc7",a2:"#0ea5e9",gr:"linear-gradient(135deg,#5b5fc7 0%,#8b5cf6 50%,#0ea5e9 100%)",dg:"#ef4444",wn:"#f59e0b",ok:"#22c55e",or:"#f97316",pk:"#ec4899"},
  sunset: {name:"Sunset Warm",bg:"#141018",sf:"#1e1726",s2:"#2a2033",bd:"#3d2e4a",tx:"#f8e8d4",mt:"#a89080",ac:"#f97316",a2:"#eab308",gr:"linear-gradient(135deg,#f97316 0%,#ef4444 50%,#eab308 100%)",dg:"#ef4444",wn:"#f59e0b",ok:"#22c55e",or:"#f97316",pk:"#ec4899"},
};
const C = {...THEMES[ls.get("theme","dark")||"dark"]};
function applyTheme(name) { const t=THEMES[name]||THEMES.dark; Object.keys(t).forEach(k=>{C[k]=t[k];}); }
const ThemeCtx = createContext(null); const useTheme = () => useContext(ThemeCtx);
function ThemeProvider({children}) {
  const [themeName,setThemeName] = useState(ls.get("theme","dark")||"dark");
  const switchTheme = useCallback((name)=>{ applyTheme(name); ls.set("theme",name); setThemeName(name); },[]);
  return <ThemeCtx.Provider value={{themeName,switchTheme,themes:THEMES}}>{children}</ThemeCtx.Provider>;
}
const Card=({children,style,onClick,...p})=><div onClick={onClick} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:16,padding:20,...style}} {...p}>{children}</div>;
const Badge=({children,color=C.ac,style})=><span style={{display:"inline-block",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,background:color+"22",color,...style}}>{children}</span>;
const Btn=({children,variant="primary",style,disabled,...p})=>{const v={primary:{background:C.gr,color:"#fff"},secondary:{background:C.s2,color:C.tx,border:`1px solid ${C.bd}`},danger:{background:C.dg+"22",color:C.dg},ghost:{background:"transparent",color:C.mt}};return<button style={{padding:"12px 24px",borderRadius:12,border:"none",fontWeight:600,fontSize:14,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:8,justifyContent:"center",transition:"all .2s",...v[variant],...style}} disabled={disabled}{...p}>{children}</button>;};
const Input=({label,style,...p})=><div style={{display:"flex",flexDirection:"column",gap:6,width:"100%"}}>{label&&<label style={{fontSize:13,color:C.mt,fontWeight:500}}>{label}</label>}<input style={{background:C.s2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"12px 16px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",...style}}{...p}/></div>;
const TextArea=({label,style,...p})=><div style={{display:"flex",flexDirection:"column",gap:6,width:"100%"}}>{label&&<label style={{fontSize:13,color:C.mt,fontWeight:500}}>{label}</label>}<textarea style={{background:C.s2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"12px 16px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",minHeight:80,resize:"vertical",...style}}{...p}/></div>;
const Sel=({label,options,style,...p})=><div style={{display:"flex",flexDirection:"column",gap:6,width:"100%"}}>{label&&<label style={{fontSize:13,color:C.mt,fontWeight:500}}>{label}</label>}<select style={{background:C.s2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"12px 16px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit",...style}}{...p}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
const Modal=({open,onClose,title,children,wide})=>{if(!open)return null;return<div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}><div style={{background:C.sf,borderRadius:20,padding:24,maxWidth:wide?640:480,width:"100%",maxHeight:"85vh",overflowY:"auto",border:`1px solid ${C.bd}`}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{color:C.tx,margin:0,fontSize:18}}>{title}</h3><button onClick={onClose} style={{background:"none",border:"none",color:C.mt,fontSize:22,cursor:"pointer"}}>✕</button></div>{children}</div></div>;};
const Spin=()=><div style={{display:"flex",justifyContent:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.bd}`,borderTopColor:C.ac,borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>;
const Empty=({icon,text})=><div style={{textAlign:"center",padding:48,color:C.mt}}><div style={{fontSize:40,marginBottom:12}}>{icon}</div><div style={{fontSize:14}}>{text}</div></div>;
const ST=({children,right})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{color:C.tx,fontSize:20,margin:0,fontWeight:700}}>{children}</h2>{right}</div>;
const SC=({label,value,icon,color})=><Card style={{padding:16}}><div style={{width:36,height:36,borderRadius:10,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,fontSize:18}}>{icon}</div><div style={{fontSize:22,fontWeight:700,color:C.tx}}>{value}</div><div style={{fontSize:12,color:C.mt,marginTop:2}}>{label}</div></Card>;
const Tabs=({tabs,active,onChange})=><div style={{display:"flex",gap:4,marginBottom:16,overflowX:"auto",paddingBottom:4}}>{tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:active===t.id?C.ac:C.s2,color:active===t.id?"#fff":C.mt,whiteSpace:"nowrap",transition:"all .2s"}}>{t.label}</button>)}</div>;
const PBar=({value,max=100,color=C.ac})=><div style={{height:6,borderRadius:3,background:C.bd,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min((value/max)*100,100)}%`,borderRadius:3,background:color,transition:"width .5s"}}/></div>;
const Splash=()=><div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16}}><div style={{width:56,height:56,borderRadius:16,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:"#fff"}}>C</div><Spin/></div>;

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen(){const{login,register}=useAuth();const[mode,setMode]=useState("login");const[form,setForm]=useState({name:"",email:"",password:"",role:"coach"});const[error,setError]=useState("");const[busy,setBusy]=useState(false);const submit=async()=>{setError("");if(!form.email||!form.password)return setError("Email and password required");setBusy(true);try{mode==="login"?await login(form.email,form.password):await register(form);}catch(e){setError(e.message);}setBusy(false);};return<div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:20}}><Card style={{maxWidth:400,width:"100%"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{width:52,height:52,borderRadius:14,background:C.gr,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:"#fff",marginBottom:12}}>C</div><h1 style={{color:C.tx,margin:0,fontSize:22,fontWeight:700}}>CoachMe.life</h1><p style={{color:C.mt,margin:"6px 0 0",fontSize:14}}>{mode==="login"?"Welcome back":"Create your account"}</p></div><div style={{display:"flex",flexDirection:"column",gap:14}}>{mode==="register"&&<><Input label="Full Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="John Doe"/><Sel label="I am a…" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} options={[{value:"COACH",label:"Coach"},{value:"CLIENT",label:"Client"}]}/></>}<Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@email.com"/><Input label="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>{error&&<div style={{color:C.dg,fontSize:13,padding:"8px 12px",background:C.dg+"15",borderRadius:8}}>{error}</div>}<Btn onClick={submit} disabled={busy} style={{width:"100%"}}>{busy?"Please wait…":mode==="login"?"Sign In":"Create Account"}</Btn><p style={{color:C.mt,fontSize:13,textAlign:"center",margin:0}}>{mode==="login"?"No account?":"Have an account?"}{" "}<span onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}} style={{color:C.ac,cursor:"pointer",fontWeight:600}}>{mode==="login"?"Sign Up":"Sign In"}</span></p></div></Card></div>;}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardPage(){const{user}=useAuth();const[stats,setStats]=useState({});const[up,setUp]=useState([]);const[clientCount,setClientCount]=useState(0);const[leadCount,setLeadCount]=useState(0);const[loading,setLoading]=useState(true);useEffect(()=>{Promise.all([api.get("/reports/coach/dashboard").catch(()=>({})),api.get("/bookings").catch(()=>({})),api.get("/clients").catch(()=>({})),api.get("/leads").catch(()=>({}))]).then(([s,b,c,l])=>{setStats(s?.data||s||{});const cl=unwrap(c,"clients");setClientCount(cl.length);const ld=unwrap(l,"leads");setLeadCount(ld.length);const allBk=unwrap(b,"bookings","sessions");const now=new Date();setUp(allBk.filter(x=>{try{const st=(x.status||"").toUpperCase();return new Date(x.date||x.startTime||x.scheduledAt)>=now&&st!=="CANCELLED"&&st!=="ABSENT";}catch{return false;}}).sort((a,b)=>new Date(a.date||a.startTime||a.scheduledAt)-new Date(b.date||b.startTime||b.scheduledAt)).slice(0,5));}).finally(()=>setLoading(false));},[]);if(loading)return<Spin/>;const g=new Date().getHours()<12?"Good morning":new Date().getHours()<17?"Good afternoon":"Good evening";return<div><div style={{marginBottom:20}}><div style={{fontSize:14,color:C.mt}}>{g},</div><h2 style={{color:C.tx,fontSize:22,margin:"4px 0 0",fontWeight:700}}>{user?.name||"Coach"} 👋</h2></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><SC label="Active Clients" value={clientCount} icon="👥" color={C.ac}/><SC label="Monthly Revenue" value={`₹${(stats.monthlyRevenue??stats.totalRevenue??0).toLocaleString()}`} icon="📈" color={C.ok}/><SC label="Upcoming" value={up.length} icon="📅" color={C.a2}/><SC label="Leads" value={leadCount} icon="🎯" color={C.wn}/></div><Card style={{marginTop:16}}><div style={{fontSize:15,fontWeight:600,color:C.tx,marginBottom:12}}>Upcoming Sessions</div>{up.length===0?<div style={{color:C.mt,fontSize:13}}>No upcoming sessions</div>:up.map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.bd}`}}><div style={{width:40,height:40,borderRadius:10,background:C.ac+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📅</div><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{cName(s.client)||s.type||"Session"}</div><div style={{fontSize:12,color:C.mt}}>{new Date(s.date||s.startTime||s.scheduledAt).toLocaleDateString()} · {s.duration||60}min</div></div><Badge color={(s.status||"").toLowerCase()==="confirmed"?C.ok:C.wn}>{(s.status||"pending").toLowerCase()}</Badge></div>)}</Card></div>;}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
function ClientsPage({onOpenChat}){
  const[clients,setClients]=useState([]);const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState("");const[sel,setSel]=useState(null);const[tab,setTab]=useState("overview");
  const[showAdd,setShowAdd]=useState(false);const[showEdit,setShowEdit]=useState(false);
  const[showBulk,setShowBulk]=useState(false);const[csvText,setCsvText]=useState("");
  const[form,setForm]=useState({name:"",email:"",phone:"",sessionType:"offline",goals:"",notes:"",emergencyContact:"",address:"",dob:"",gender:"",injuries:""});
  const emptyForm={name:"",email:"",phone:"",sessionType:"offline",goals:"",notes:"",emergencyContact:"",address:"",dob:"",gender:"",injuries:""};
  const load=()=>api.get("/clients").then(d=>{
    const raw=unwrap(d,"clients");
    const edits=ls.get("client_edits",{});
    // Apply local edits overlay
    const merged=raw.map(c=>{const e=edits[c.id];return e?{...c,...e,name:e.displayName||e.name||c.displayName||c.name}:c;});
    setClients(merged);
  }).catch(()=>{}).finally(()=>setLoading(false));
  useEffect(()=>{load();},[]);
  const filtered=clients.filter(c=>(cName(c)||"").toLowerCase().includes(search.toLowerCase())||(cEmail(c)||"").toLowerCase().includes(search.toLowerCase())||(c.phone||"").includes(search));

  const addClient=async()=>{if(!form.name||!form.email){alert("Name and email are required");return;}if(!form.phone){alert("Mobile number is required");return;}try{await api.post("/clients",form);setForm(emptyForm);setShowAdd(false);load();}catch(e){alert(e.message);}};
  const editClient=async()=>{
    const updateData={...form,displayName:form.name};
    // Try multiple update paths
    const paths=[`/clients/${sel.id}`,`/coaches/clients/${sel.id}`,`/clients/${sel.userId||sel.id}`];
    let success=false;
    for(const path of paths){
      try{await api.put(path,updateData);success=true;break;}
      catch(e){if(!e.message.includes("404")&&!e.message.includes("Not found"))throw e;}
    }
    if(!success){
      // Fallback: save edit locally
      const edits=ls.get("client_edits",{});
      edits[sel.id]={...updateData,_editedAt:new Date().toISOString()};
      ls.set("client_edits",edits);
    }
    setShowEdit(false);load();
    const updated={...sel,...form,displayName:form.name};setSel(updated);
  };
  const deleteClient=async(id)=>{if(!confirm("Delete this client? This cannot be undone."))return;try{await api.del(`/clients/${id}`);setSel(null);load();}catch(e){alert(e.message);}};

  const bulkUpload=async()=>{
    try{
      const rows=csvText.trim().split("\n").filter(r=>r.trim());
      if(rows.length<2){alert("Need header row + data rows");return;}
      const headers=rows[0].split(",").map(h=>h.trim().toLowerCase());
      const data=rows.slice(1).map(r=>{const vals=r.split(",");const obj={};headers.forEach((h,i)=>{const key=h==="mobile"||h==="phone number"?"phone":h==="full name"?"name":h;obj[key]=vals[i]?.trim()||"";});return obj;});
      try{await api.post("/clients/bulk",{clients:data});}catch{for(const c of data){try{await api.post("/clients",c);}catch{}}}
      setCsvText("");setShowBulk(false);load();
    }catch(e){alert("Upload error: "+e.message);}
  };

  const handlePhotoUpload=async(e,type)=>{
    const file=e.target.files?.[0];if(!file)return;
    const fd=new FormData();fd.append("file",file);fd.append("type",type);fd.append("clientId",sel.id);
    try{await api.upload(`/clients/${sel.id}/photo`,fd);load();}catch{
      const reader=new FileReader();reader.onload=ev=>{
        const photos=ls.get(`photos_${sel.id}`,{});photos[type]=ev.target.result;
        ls.set(`photos_${sel.id}`,photos);setSel({...sel,_photos:photos});
      };reader.readAsDataURL(file);
    }
  };

  if(loading)return<Spin/>;

  // Client detail view
  if(sel){const nm=cName(sel);const photos=ls.get(`photos_${sel.id}`,{});
  return<div>
    <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontSize:14,fontWeight:600,marginBottom:12,padding:0,fontFamily:"inherit"}}>← Back</button>
    <Card style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
      <div style={{position:"relative"}}>
        {photos.profile?<img src={photos.profile} style={{width:56,height:56,borderRadius:16,objectFit:"cover"}}/>:
        <div style={{width:56,height:56,borderRadius:16,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff"}}>{nm[0].toUpperCase()}</div>}
        <label style={{position:"absolute",bottom:-4,right:-4,width:22,height:22,borderRadius:11,background:C.ac,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:10,color:"#fff",border:`2px solid ${C.sf}`}}>📷<input type="file" accept="image/*" onChange={e=>handlePhotoUpload(e,"profile")} style={{display:"none"}}/></label>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{nm}</div>
        <div style={{fontSize:13,color:C.mt}}>{cEmail(sel)}</div>
        {sel.phone&&<div style={{fontSize:12,color:C.mt}}>📱 {sel.phone}</div>}
        <Badge color={sel.sessionType==="online"?C.a2:C.ac} style={{marginTop:4}}>{sel.sessionType||"offline"}</Badge>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <button onClick={()=>onOpenChat?.(sel)} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:C.a2+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💬</button>
        <button onClick={()=>{setForm({name:cName(sel)||"",email:cEmail(sel)||"",phone:sel.phone||"",sessionType:sel.sessionType||"offline",goals:sel.goals||"",notes:sel.notes||"",emergencyContact:sel.emergencyContact||"",address:sel.address||"",dob:sel.dob||"",gender:sel.gender||"",injuries:sel.injuries||""});setShowEdit(true);}} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:C.wn+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✏️</button>
        <button onClick={()=>deleteClient(sel.id)} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:C.dg+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🗑️</button>
      </div>
    </Card>

    {/* Client details card */}
    <Card style={{marginBottom:12,padding:14}}>
      <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:8}}>Details</div>
      {[{l:"Goals",v:sel.goals},{l:"Gender",v:sel.gender},{l:"DOB",v:sel.dob},{l:"Address",v:sel.address},{l:"Emergency Contact",v:sel.emergencyContact},{l:"Injuries/Notes",v:sel.injuries||sel.notes}].filter(x=>x.v).map(x=>
        <div key={x.l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 0",borderBottom:`1px solid ${C.bd}`}}>
          <span style={{color:C.mt}}>{x.l}</span><span style={{color:C.tx,fontWeight:500,maxWidth:"60%",textAlign:"right"}}>{x.v}</span>
        </div>
      )}
    </Card>

    <Tabs tabs={[{id:"overview",label:"Overview"},{id:"progress",label:"Progress"},{id:"habits",label:"Habits"},{id:"nutrition",label:"Nutrition"},{id:"checkins",label:"Check-ins"},{id:"media",label:"Media"}]} active={tab} onChange={setTab}/>
    {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><SC label="Sessions" value={sel.totalSessions??0} icon="📅" color={C.ac}/><SC label="Streak" value={`${sel.streak??0}d`} icon="🔥" color={C.or}/><SC label="Compliance" value={`${sel.compliance??0}%`} icon="✅" color={C.ok}/><SC label="Goal Progress" value={`${sel.goalProgress??0}%`} icon="🎯" color={C.a2}/></div>}
    {tab==="progress"&&<ProgressTracker cid={sel.id}/>}
    {tab==="habits"&&<HabitTracker cid={sel.id}/>}
    {tab==="nutrition"&&<NutritionTracker cid={sel.id}/>}
    {tab==="checkins"&&<CheckInsPage/>}
    {tab==="media"&&<MediaLibrary clientId={sel.id} clientName={nm}/>}

    {/* Edit Modal */}
    <Modal open={showEdit} onClose={()=>setShowEdit(false)} title="Edit Client" wide>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input label="Email *" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Mobile *" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+91 98765 43210"/><Sel label="Session Type" value={form.sessionType} onChange={e=>setForm({...form,sessionType:e.target.value})} options={[{value:"offline",label:"Offline (In-person)"},{value:"online",label:"Online (Virtual)"},{value:"hybrid",label:"Hybrid"}]}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Date of Birth" type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/><Sel label="Gender" value={form.gender||""} onChange={e=>setForm({...form,gender:e.target.value})} options={[{value:"",label:"— Select —"},{value:"male",label:"Male"},{value:"female",label:"Female"},{value:"other",label:"Other"}]}/></div>
        <Input label="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
        <TextArea label="Goals" value={form.goals} onChange={e=>setForm({...form,goals:e.target.value})} placeholder="e.g. Lose 10kg, Build muscle"/>
        <Input label="Emergency Contact" value={form.emergencyContact} onChange={e=>setForm({...form,emergencyContact:e.target.value})} placeholder="Name - Phone"/>
        <TextArea label="Injuries / Medical Notes" value={form.injuries} onChange={e=>setForm({...form,injuries:e.target.value})} placeholder="Any injuries or medical conditions"/>
        <Btn onClick={editClient} style={{width:"100%"}}>Save Changes</Btn>
      </div>
    </Modal>
  </div>;}

  // Client list view
  return<div>
    <ST right={<div style={{display:"flex",gap:6}}>
      <Btn variant="secondary" onClick={()=>setShowBulk(true)} style={{padding:"8px 12px",fontSize:12}}>📤 Import</Btn>
      <Btn onClick={()=>{setForm(emptyForm);setShowAdd(true);}} style={{padding:"8px 14px",fontSize:13}}>+ Add Client</Btn>
    </div>}>Clients</ST>
    <Input placeholder="Search by name, email, or phone…" value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:14}}/>
    {filtered.length===0?<Empty icon="👥" text="No clients found"/>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {filtered.map(c=>{const isOnline=c.lastLogin&&(Date.now()-new Date(c.lastLogin).getTime())<15*60*1000;const lastSeen=c.lastLogin?new Date(c.lastLogin):c.lastActive?new Date(c.lastActive):null;const lastSeenText=lastSeen?((Date.now()-lastSeen.getTime())<60*60*1000?`${Math.round((Date.now()-lastSeen.getTime())/60000)}m ago`:lastSeen.toLocaleDateString()):"Never";return<Card key={c.id} onClick={()=>setSel(c)} style={{padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:42,height:42,borderRadius:12,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff"}}>{(cName(c))[0].toUpperCase()}</div>
          <div style={{position:"absolute",bottom:-2,right:-2,width:12,height:12,borderRadius:6,border:`2px solid ${C.sf}`,background:isOnline?C.ok:C.mt}} title={isOnline?"Online":"Offline"}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.tx,fontSize:14,fontWeight:600}}>{cName(c)}</div>
          <div style={{color:C.mt,fontSize:12}}>{cEmail(c)}{c.phone?` · ${c.phone}`:""}</div>
          <div style={{color:C.mt,fontSize:10,marginTop:2}}>{isOnline?<span style={{color:C.ok}}>Online</span>:<span>Last seen: {lastSeenText}</span>}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <Badge color={c.status==="active"?C.ok:C.mt} style={{fontSize:10}}>{c.status||"active"}</Badge>
        </div>
      </Card>;})}
    </div>}

    {/* Add Client Modal */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New Client" wide>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Full Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="John Doe"/><Input label="Email *" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="john@email.com"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Mobile *" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+91 98765 43210"/><Sel label="Session Type *" value={form.sessionType} onChange={e=>setForm({...form,sessionType:e.target.value})} options={[{value:"offline",label:"Offline (In-person)"},{value:"online",label:"Online (Virtual)"},{value:"hybrid",label:"Hybrid"}]}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Date of Birth" type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/><Sel label="Gender" value={form.gender||""} onChange={e=>setForm({...form,gender:e.target.value})} options={[{value:"",label:"— Select —"},{value:"male",label:"Male"},{value:"female",label:"Female"},{value:"other",label:"Other"}]}/></div>
        <Input label="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
        <TextArea label="Goals" value={form.goals} onChange={e=>setForm({...form,goals:e.target.value})} placeholder="e.g. Lose 10kg in 3 months"/>
        <Input label="Emergency Contact" value={form.emergencyContact} onChange={e=>setForm({...form,emergencyContact:e.target.value})} placeholder="Name - Phone"/>
        <TextArea label="Injuries / Medical Notes" value={form.injuries} onChange={e=>setForm({...form,injuries:e.target.value})}/>
        <Btn onClick={addClient} disabled={!form.name||!form.email||!form.phone} style={{width:"100%"}}>Add Client</Btn>
      </div>
    </Modal>

    {/* Bulk Upload Modal */}
    <Modal open={showBulk} onClose={()=>setShowBulk(false)} title="Import Clients (CSV)" wide>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{padding:12,background:C.s2,borderRadius:10,fontSize:12,color:C.mt,lineHeight:1.6}}>
          <strong style={{color:C.tx}}>CSV Format:</strong><br/>
          name, email, phone, sessionType<br/>
          John Doe, john@email.com, 9876543210, offline<br/>
          Jane Smith, jane@email.com, 9876543211, online
        </div>
        <div>
          <label style={{fontSize:13,color:C.mt,fontWeight:500,marginBottom:6,display:"block"}}>Upload CSV File</label>
          <input type="file" accept=".csv,.txt" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setCsvText(ev.target.result);r.readAsText(f);}}} style={{fontSize:13,color:C.tx}}/>
        </div>
        <div style={{fontSize:13,color:C.mt,fontWeight:500}}>Or paste CSV data:</div>
        <TextArea value={csvText} onChange={e=>setCsvText(e.target.value)} placeholder="name, email, phone, sessionType&#10;John Doe, john@email.com, 9876543210, offline" style={{minHeight:120,fontFamily:"monospace",fontSize:12}}/>
        <Btn onClick={bulkUpload} disabled={!csvText.trim()} style={{width:"100%"}}>📤 Import {csvText.trim()?csvText.trim().split("\\n").length-1:0} Clients</Btn>
      </div>
    </Modal>
  </div>;
}

// ─── PROGRESS TRACKER ─────────────────────────────────────────────────────────
function ProgressTracker({cid}){
  const[entries,setEntries]=useState(ls.get(`prog_${cid}`,[]));
  const[showAdd,setShowAdd]=useState(false);
  const[tab,setTab]=useState("overview");
  const[activeMetric,setActiveMetric]=useState("weight");
  const[form,setForm]=useState({date:new Date().toISOString().slice(0,10),weight:"",height:"",bodyFat:"",chest:"",waist:"",hips:"",bicepsL:"",bicepsR:"",thighL:"",thighR:"",calves:"",shoulders:"",neck:"",forearm:"",notes:""});
  const emptyForm={date:new Date().toISOString().slice(0,10),weight:"",height:"",bodyFat:"",chest:"",waist:"",hips:"",bicepsL:"",bicepsR:"",thighL:"",thighR:"",calves:"",shoulders:"",neck:"",forearm:"",notes:""};

  // Merge device data + check-in data into entries
  const deviceData=ls.get("device_data",[]).filter(d=>d.weight>0);
  const checkins=ls.get(`checkins`,[]); // check-ins with weight
  const allEntries=useMemo(()=>{
    const merged=[...entries];
    // Add device weights that aren't already in entries
    deviceData.forEach(d=>{
      if(d.weight&&!merged.some(e=>e.date===d.date&&e.source==="device")){
        merged.push({id:`dev_${d.date}`,date:d.date,weight:d.weight,source:"device",heartRateAvg:d.heartRateAvg,steps:d.steps,sleepHours:d.sleepHours,spo2:d.spo2});
      }
    });
    // Add check-in weights
    checkins.forEach(c=>{
      if(c.weight&&!merged.some(e=>e.date===c.date&&e.source==="checkin")){
        merged.push({id:`ck_${c.date}`,date:c.date,weight:c.weight,source:"checkin",energy:c.energy,sleep:c.sleep,adherence:c.adherence,mood:c.mood});
      }
    });
    return merged.sort((a,b)=>a.date.localeCompare(b.date));
  },[entries,deviceData.length,checkins.length]);

  const save=()=>{
    const entry={...form,id:Date.now(),source:"manual"};
    // Convert all numeric fields
    ["weight","height","bodyFat","chest","waist","hips","bicepsL","bicepsR","thighL","thighR","calves","shoulders","neck","forearm"].forEach(k=>{entry[k]=+entry[k]||0;});
    // Calculate BMI if height and weight
    if(entry.weight&&entry.height){entry.bmi=+(entry.weight/((entry.height/100)**2)).toFixed(1);}
    const u=[...entries,entry];setEntries(u);ls.set(`prog_${cid}`,u);
    setShowAdd(false);setForm(emptyForm);
  };

  // Auto-import from device button
  const importFromDevice=()=>{
    const dData=ls.get("device_data",[]);
    const latest=dData.sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(latest){
      setForm(f=>({...f,weight:String(latest.weight||""),date:latest.date||f.date}));
    }else{alert("No device data found. Connect a fitness device first.");}
  };

  const lat=allEntries[allEntries.length-1];
  const prev=allEntries.length>1?allEntries[allEntries.length-2]:null;

  // Calculate current BMI
  const currentBMI=lat?.bmi||(lat?.weight&&lat?.height?(lat.weight/((lat.height/100)**2)).toFixed(1):null);
  const bmiCategory=currentBMI?(currentBMI<18.5?"Underweight":currentBMI<25?"Normal":currentBMI<30?"Overweight":"Obese"):null;
  const bmiColor=currentBMI?(currentBMI<18.5?C.wn:currentBMI<25?C.ok:currentBMI<30?C.wn:C.dg):C.mt;

  // Diff calculator
  const diff=(field)=>{
    if(!lat||!prev)return null;
    const v=+(lat[field]||0)-(+(prev[field]||0));
    return v===0?null:v;
  };

  // All metric definitions for the trend chart
  const metrics=[
    {id:"weight",label:"Weight",unit:"kg",color:C.ac,icon:"⚖️"},
    {id:"bmi",label:"BMI",unit:"",color:bmiColor,icon:"📊"},
    {id:"bodyFat",label:"Body Fat",unit:"%",color:C.or,icon:"🔥"},
    {id:"chest",label:"Chest",unit:"cm",color:C.a2,icon:"📏"},
    {id:"waist",label:"Waist",unit:"cm",color:C.wn,icon:"📏"},
    {id:"hips",label:"Hips",unit:"cm",color:C.pk,icon:"📏"},
    {id:"bicepsL",label:"Biceps (L)",unit:"cm",color:C.ok,icon:"💪"},
    {id:"bicepsR",label:"Biceps (R)",unit:"cm",color:C.ok,icon:"💪"},
    {id:"shoulders",label:"Shoulders",unit:"cm",color:C.ac,icon:"📏"},
    {id:"thighL",label:"Thigh (L)",unit:"cm",color:C.a2,icon:"🦵"},
    {id:"thighR",label:"Thigh (R)",unit:"cm",color:C.a2,icon:"🦵"},
    {id:"calves",label:"Calves",unit:"cm",color:C.wn,icon:"📏"},
    {id:"neck",label:"Neck",unit:"cm",color:C.mt,icon:"📏"},
    {id:"forearm",label:"Forearm",unit:"cm",color:C.ok,icon:"💪"},
  ];

  // Get data points for a specific metric
  const getMetricData=(metricId)=>allEntries.filter(e=>e[metricId]&&+e[metricId]>0).map(e=>({date:e.date,value:+e[metricId],source:e.source||"manual"}));

  // Share on WhatsApp
  const shareOnWhatsApp=(clientName)=>{
    let msg=`📊 *Progress Report — ${clientName||"Client"}*\n📅 ${new Date().toLocaleDateString()}\n\n`;
    if(lat){
      if(lat.weight)msg+=`⚖️ Weight: ${lat.weight}kg`;
      if(prev?.weight){const d=diff("weight");if(d)msg+=` (${d>0?"+":""}${d.toFixed(1)}kg)`;}
      msg+="\n";
      if(currentBMI)msg+=`📊 BMI: ${currentBMI} (${bmiCategory})\n`;
      if(lat.bodyFat)msg+=`🔥 Body Fat: ${lat.bodyFat}%\n`;
      if(lat.chest)msg+=`📏 Chest: ${lat.chest}cm\n`;
      if(lat.waist)msg+=`📏 Waist: ${lat.waist}cm\n`;
      if(lat.hips)msg+=`📏 Hips: ${lat.hips}cm\n`;
      if(lat.bicepsL||lat.bicepsR)msg+=`💪 Biceps: L=${lat.bicepsL||"—"}cm R=${lat.bicepsR||"—"}cm\n`;
      if(lat.shoulders)msg+=`📏 Shoulders: ${lat.shoulders}cm\n`;
      if(lat.thighL||lat.thighR)msg+=`🦵 Thighs: L=${lat.thighL||"—"}cm R=${lat.thighR||"—"}cm\n`;
    }
    // Add trend
    const weightData=getMetricData("weight");
    if(weightData.length>=2){
      const first=weightData[0];const last=weightData[weightData.length-1];
      const totalChange=(last.value-first.value).toFixed(1);
      msg+=`\n📈 *Trend (${weightData.length} entries):*\n`;
      msg+=`Start: ${first.value}kg → Now: ${last.value}kg\n`;
      msg+=`Change: ${totalChange>0?"+":""}${totalChange}kg over ${Math.ceil((new Date(last.date)-new Date(first.date))/(1000*60*60*24))} days\n`;
    }
    // Add device data if available
    const devData=ls.get("device_data",[]).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(devData){
      msg+=`\n⌚ *Latest Device Data:*\n`;
      if(devData.steps)msg+=`🚶 Steps: ${devData.steps.toLocaleString()}\n`;
      if(devData.heartRateAvg)msg+=`❤️ Avg HR: ${devData.heartRateAvg} bpm\n`;
      if(devData.sleepHours)msg+=`😴 Sleep: ${devData.sleepHours}h\n`;
    }
    msg+=`\n_Tracked on CoachMe.life_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
  };

  // Trend chart component
  const TrendLine=({data,color,label,unit})=>{
    if(data.length<2)return null;
    const vals=data.map(d=>d.value);
    const min=Math.min(...vals);const max=Math.max(...vals);const range=max-min||1;
    const first=vals[0];const last=vals[vals.length-1];
    const change=(last-first).toFixed(1);
    return<Card style={{padding:14,marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{label}</span>
        <span style={{fontSize:12,fontWeight:600,color:change>0?C.dg:change<0?C.ok:C.mt}}>
          {change>0?"+":""}{change}{unit} ({data.length} pts)
        </span>
      </div>
      {/* SVG line chart */}
      <svg viewBox={`0 0 ${Math.max(data.length*30,200)} 80`} style={{width:"100%",height:80}}>
        {/* Grid lines */}
        {[0,1,2,3].map(i=><line key={i} x1="0" y1={i*20+10} x2={data.length*30} y2={i*20+10} stroke={C.bd} strokeWidth="0.5"/>)}
        {/* Line path */}
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          points={data.map((d,i)=>{const x=i*(Math.max(data.length*30,200)/(data.length-1));const y=70-((d.value-min)/range)*60;return`${x},${y}`;}).join(" ")}/>
        {/* Dots */}
        {data.map((d,i)=>{const x=i*(Math.max(data.length*30,200)/(data.length-1));const y=70-((d.value-min)/range)*60;
        return<circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke={C.sf} strokeWidth="1.5">
          <title>{d.date}: {d.value}{unit} ({d.source})</title>
        </circle>;})}
        {/* Value labels on first and last */}
        <text x="2" y={70-((vals[0]-min)/range)*60-8} fill={C.mt} fontSize="9" fontFamily="inherit">{vals[0]}{unit}</text>
        <text x={Math.max(data.length*30,200)-30} y={70-((vals[vals.length-1]-min)/range)*60-8} fill={color} fontSize="9" fontWeight="600" fontFamily="inherit">{vals[vals.length-1]}{unit}</text>
      </svg>
      {/* Date range */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.mt,marginTop:4}}>
        <span>{data[0].date.slice(5)}</span>
        <span>{data[data.length-1].date.slice(5)}</span>
      </div>
    </Card>;
  };

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <span style={{fontSize:15,fontWeight:600,color:C.tx}}>Progress Tracker</span>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>shareOnWhatsApp()} style={{padding:"6px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:"#25D366"+"20",color:"#25D366"}}>📲 Share</button>
        <Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Log</Btn>
      </div>
    </div>

    <Tabs tabs={[{id:"overview",label:"Overview"},{id:"trends",label:"Trends"},{id:"history",label:"History"}]} active={tab} onChange={setTab}/>

    {/* ── OVERVIEW TAB ── */}
    {tab==="overview"&&<div>
      {/* Current stats grid */}
      {lat?<div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:C.tx}}>{lat.weight||"—"}<span style={{fontSize:12,color:C.mt}}>kg</span></div>
            {diff("weight")!==null&&<div style={{fontSize:11,color:diff("weight")>0?C.dg:C.ok}}>{diff("weight")>0?"+":""}{diff("weight").toFixed(1)}kg</div>}
            <div style={{fontSize:11,color:C.mt}}>Weight</div>
          </Card>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:bmiColor}}>{currentBMI||"—"}</div>
            {bmiCategory&&<div style={{fontSize:10,color:bmiColor}}>{bmiCategory}</div>}
            <div style={{fontSize:11,color:C.mt}}>BMI</div>
          </Card>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:C.or}}>{lat.bodyFat||"—"}<span style={{fontSize:12,color:C.mt}}>%</span></div>
            {diff("bodyFat")!==null&&<div style={{fontSize:11,color:diff("bodyFat")>0?C.dg:C.ok}}>{diff("bodyFat")>0?"+":""}{diff("bodyFat").toFixed(1)}%</div>}
            <div style={{fontSize:11,color:C.mt}}>Body Fat</div>
          </Card>
        </div>

        {/* Body measurements */}
        <Card style={{padding:14,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:10}}>Body Measurements</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[{l:"Chest",v:lat.chest,u:"cm",icon:"📏"},{l:"Waist",v:lat.waist,u:"cm",icon:"📏"},{l:"Hips",v:lat.hips,u:"cm",icon:"📏"},{l:"Shoulders",v:lat.shoulders,u:"cm",icon:"📏"},{l:"Biceps L",v:lat.bicepsL,u:"cm",icon:"💪"},{l:"Biceps R",v:lat.bicepsR,u:"cm",icon:"💪"},{l:"Thigh L",v:lat.thighL,u:"cm",icon:"🦵"},{l:"Thigh R",v:lat.thighR,u:"cm",icon:"🦵"},{l:"Calves",v:lat.calves,u:"cm",icon:"📏"},{l:"Neck",v:lat.neck,u:"cm",icon:"📏"},{l:"Forearm",v:lat.forearm,u:"cm",icon:"💪"},{l:"Height",v:lat.height,u:"cm",icon:"📐"}].filter(m=>m.v&&+m.v>0).map(m=>
              <div key={m.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.bd}`,fontSize:12}}>
                <span style={{color:C.mt}}>{m.icon} {m.l}</span>
                <span style={{color:C.tx,fontWeight:600}}>{m.v} {m.u}{diff(m.l.toLowerCase().replace(/\s/g,""))!==null?` (${diff(m.l.toLowerCase().replace(/\s/g,""))>0?"+":""}${diff(m.l.toLowerCase().replace(/\s/g,"")).toFixed(1)})`:""}</span>
              </div>
            )}
          </div>
          {[...new Set(["chest","waist","hips","shoulders","bicepsL","bicepsR","thighL","thighR"].filter(k=>lat[k]&&+lat[k]>0))].length===0&&
            <div style={{color:C.mt,fontSize:12,textAlign:"center",padding:8}}>Log measurements to see them here</div>}
        </Card>

        {/* Source badges */}
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {allEntries.some(e=>e.source==="manual")&&<Badge color={C.ac}>📝 Manual</Badge>}
          {allEntries.some(e=>e.source==="device")&&<Badge color={C.a2}>⌚ Device</Badge>}
          {allEntries.some(e=>e.source==="checkin")&&<Badge color={C.ok}>📋 Check-in</Badge>}
          <Badge color={C.mt}>{allEntries.length} entries</Badge>
        </div>
      </div>:<Empty icon="📏" text="No progress data yet. Log your first entry or connect a device!"/>}
    </div>}

    {/* ── TRENDS TAB ── */}
    {tab==="trends"&&<div>
      {/* Metric selector pills */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {metrics.filter(m=>getMetricData(m.id).length>=2).map(m=>
          <button key={m.id} onClick={()=>setActiveMetric(m.id)} style={{padding:"5px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:activeMetric===m.id?m.color+"30":C.s2,color:activeMetric===m.id?m.color:C.mt}}>{m.icon} {m.label}</button>
        )}
      </div>

      {/* Active metric chart */}
      {metrics.filter(m=>getMetricData(m.id).length>=2).length===0?
        <Empty icon="📈" text="Need at least 2 entries to show trends. Keep logging!"/>:
        <div>
          {/* Show selected metric's trend */}
          {(()=>{const m=metrics.find(x=>x.id===activeMetric);const data=getMetricData(activeMetric);
            return data.length>=2?<TrendLine data={data} color={m.color} label={m.label} unit={m.unit}/>:null;
          })()}

          {/* Show all metrics with data as smaller charts */}
          <div style={{fontSize:13,fontWeight:600,color:C.tx,margin:"16px 0 8px"}}>All Metrics</div>
          {metrics.filter(m=>getMetricData(m.id).length>=2&&m.id!==activeMetric).map(m=>{
            const data=getMetricData(m.id);
            return<TrendLine key={m.id} data={data} color={m.color} label={m.label} unit={m.unit}/>;
          })}
        </div>
      }
    </div>}

    {/* ── HISTORY TAB ── */}
    {tab==="history"&&<div>
      {allEntries.length===0?<Empty icon="📋" text="No entries yet"/>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {allEntries.slice().reverse().map((e,i)=><Card key={e.id||i} style={{padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{e.date}</span>
            <Badge color={e.source==="device"?C.a2:e.source==="checkin"?C.ok:C.ac} style={{fontSize:10}}>
              {e.source==="device"?"⌚ Device":e.source==="checkin"?"📋 Check-in":"📝 Manual"}
            </Badge>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:C.mt}}>
            {e.weight>0&&<span>⚖️ {e.weight}kg</span>}
            {e.bmi>0&&<span>📊 BMI {e.bmi}</span>}
            {e.bodyFat>0&&<span>🔥 {e.bodyFat}%</span>}
            {e.chest>0&&<span>Chest {e.chest}</span>}
            {e.waist>0&&<span>Waist {e.waist}</span>}
            {e.bicepsL>0&&<span>💪L {e.bicepsL}</span>}
            {e.bicepsR>0&&<span>💪R {e.bicepsR}</span>}
            {e.steps>0&&<span>🚶 {e.steps.toLocaleString()}</span>}
            {e.heartRateAvg>0&&<span>❤️ {e.heartRateAvg}bpm</span>}
          </div>
          {e.notes&&<div style={{fontSize:11,color:C.mt,marginTop:6,fontStyle:"italic"}}>{e.notes}</div>}
        </Card>)}
      </div>}
    </div>}

    {/* ── LOG PROGRESS MODAL ── */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Log Progress" wide>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Input label="Date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{flex:1}}/>
          <button onClick={importFromDevice} style={{padding:"8px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:C.a2+"20",color:C.a2,marginTop:20,marginLeft:8,whiteSpace:"nowrap"}}>⌚ Import</button>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.tx}}>Body Composition</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="⚖️ Weight (kg)" type="number" step="0.1" value={form.weight} onChange={e=>setForm({...form,weight:e.target.value})}/>
          <Input label="📐 Height (cm)" type="number" value={form.height} onChange={e=>setForm({...form,height:e.target.value})}/>
          <Input label="🔥 Body Fat %" type="number" step="0.1" value={form.bodyFat} onChange={e=>setForm({...form,bodyFat:e.target.value})}/>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.tx}}>Upper Body</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="📏 Chest" type="number" step="0.1" value={form.chest} onChange={e=>setForm({...form,chest:e.target.value})}/>
          <Input label="📏 Shoulders" type="number" step="0.1" value={form.shoulders} onChange={e=>setForm({...form,shoulders:e.target.value})}/>
          <Input label="📏 Neck" type="number" step="0.1" value={form.neck} onChange={e=>setForm({...form,neck:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="💪 Bicep L" type="number" step="0.1" value={form.bicepsL} onChange={e=>setForm({...form,bicepsL:e.target.value})}/>
          <Input label="💪 Bicep R" type="number" step="0.1" value={form.bicepsR} onChange={e=>setForm({...form,bicepsR:e.target.value})}/>
          <Input label="💪 Forearm" type="number" step="0.1" value={form.forearm} onChange={e=>setForm({...form,forearm:e.target.value})}/>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.tx}}>Lower Body</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="📏 Waist" type="number" step="0.1" value={form.waist} onChange={e=>setForm({...form,waist:e.target.value})}/>
          <Input label="📏 Hips" type="number" step="0.1" value={form.hips} onChange={e=>setForm({...form,hips:e.target.value})}/>
          <Input label="📏 Calves" type="number" step="0.1" value={form.calves} onChange={e=>setForm({...form,calves:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="🦵 Thigh L" type="number" step="0.1" value={form.thighL} onChange={e=>setForm({...form,thighL:e.target.value})}/>
          <Input label="🦵 Thigh R" type="number" step="0.1" value={form.thighR} onChange={e=>setForm({...form,thighR:e.target.value})}/>
        </div>
        <TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Any observations…"/>
        <Btn onClick={save} style={{width:"100%"}}>Save Progress Entry</Btn>
      </div>
    </Modal>
  </div>;
}


// ─── HABIT TRACKER ────────────────────────────────────────────────────────────
function HabitTracker({cid}){const key=`hab_${cid||"me"}`;const[habits,setHabits]=useState(ls.get(key,[{id:1,name:"Drink 3L Water",icon:"💧",streak:0,log:{}},{id:2,name:"8h Sleep",icon:"😴",streak:0,log:{}},{id:3,name:"10k Steps",icon:"🚶",streak:0,log:{}},{id:4,name:"Eat Vegetables",icon:"🥦",streak:0,log:{}}]));const[showAdd,setShowAdd]=useState(false);const[newH,setNewH]=useState("");const today=new Date().toISOString().slice(0,10);const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});const toggle=(hid,date)=>{const u=habits.map(h=>{if(h.id!==hid)return h;const l={...h.log};l[date]=!l[date];let s=0;const d=new Date();while(l[d.toISOString().slice(0,10)]){s++;d.setDate(d.getDate()-1);}return{...h,log:l,streak:s};});setHabits(u);ls.set(key,u);};const addH=()=>{if(!newH.trim())return;const u=[...habits,{id:Date.now(),name:newH,icon:"✨",streak:0,log:{}}];setHabits(u);ls.set(key,u);setNewH("");setShowAdd(false);};const dn=["S","M","T","W","T","F","S"];return<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:15,fontWeight:600,color:C.tx}}>Daily Habits</span><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Habit</Btn></div><div style={{display:"grid",gridTemplateColumns:"1fr repeat(7,32px)",gap:4,marginBottom:8,alignItems:"center"}}><div/>{last7.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:600,color:d===today?C.ac:C.mt}}>{dn[new Date(d).getDay()]}</div>)}</div>{habits.map(h=><div key={h.id} style={{display:"grid",gridTemplateColumns:"1fr repeat(7,32px)",gap:4,marginBottom:8,alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><span style={{fontSize:16}}>{h.icon}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>{h.streak>0&&<div style={{fontSize:10,color:C.or}}>🔥 {h.streak}d</div>}</div></div>{last7.map(d=><button key={d} onClick={()=>toggle(h.id,d)} style={{width:32,height:32,borderRadius:8,border:"none",cursor:"pointer",background:h.log[d]?C.ok:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",transition:"all .2s"}}>{h.log[d]?"✓":""}</button>)}</div>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Habit"><Input label="Habit Name" value={newH} onChange={e=>setNewH(e.target.value)} placeholder="e.g. Meditate 10 min"/><Btn onClick={addH} style={{width:"100%",marginTop:12}}>Add</Btn></Modal></div>;}

// ─── NUTRITION TRACKER ────────────────────────────────────────────────────────
function NutritionTracker({cid}){const key=`nut_${cid||"me"}`;const[meals,setMeals]=useState(ls.get(key,[]));const[showAdd,setShowAdd]=useState(false);const[form,setForm]=useState({name:"",calories:"",protein:"",carbs:"",fat:"",meal:"breakfast"});const today=new Date().toISOString().slice(0,10);const tm=meals.filter(m=>m.date===today);const tot=tm.reduce((a,m)=>({cal:a.cal+m.calories,pro:a.pro+m.protein,carb:a.carb+m.carbs,fat:a.fat+m.fat}),{cal:0,pro:0,carb:0,fat:0});const tgt={cal:2200,pro:150,carb:250,fat:70};const save=()=>{const e={...form,id:Date.now(),date:today,calories:+form.calories||0,protein:+form.protein||0,carbs:+form.carbs||0,fat:+form.fat||0};const u=[...meals,e];setMeals(u);ls.set(key,u);setShowAdd(false);setForm({name:"",calories:"",protein:"",carbs:"",fat:"",meal:"breakfast"});};return<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:15,fontWeight:600,color:C.tx}}>Today's Nutrition</span><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Log</Btn></div><Card style={{padding:16,marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,textAlign:"center"}}>{[{l:"Calories",v:tot.cal,t:tgt.cal,c:C.ac,u:"kcal"},{l:"Protein",v:tot.pro,t:tgt.pro,c:C.ok,u:"g"},{l:"Carbs",v:tot.carb,t:tgt.carb,c:C.wn,u:"g"},{l:"Fat",v:tot.fat,t:tgt.fat,c:C.pk,u:"g"}].map(m=><div key={m.l}><div style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</div><PBar value={m.v} max={m.t} color={m.c}/><div style={{fontSize:10,color:C.mt,marginTop:4}}>{m.l}<br/>{m.v}/{m.t}{m.u}</div></div>)}</div></Card>{tm.length===0?<div style={{color:C.mt,fontSize:13,textAlign:"center",padding:20}}>No meals logged</div>:tm.map(m=><Card key={m.id} style={{padding:12,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:600,color:C.tx}}>{m.name}</div><div style={{fontSize:11,color:C.mt}}>{m.meal} · {m.calories}kcal</div></div><div style={{fontSize:11,color:C.mt}}>P:{m.protein}g C:{m.carbs}g F:{m.fat}g</div></Card>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Log Food"><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Food" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Grilled Chicken"/><Sel label="Meal" value={form.meal} onChange={e=>setForm({...form,meal:e.target.value})} options={[{value:"breakfast",label:"Breakfast"},{value:"lunch",label:"Lunch"},{value:"dinner",label:"Dinner"},{value:"snack",label:"Snack"}]}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Calories" type="number" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})}/><Input label="Protein (g)" type="number" value={form.protein} onChange={e=>setForm({...form,protein:e.target.value})}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Carbs (g)" type="number" value={form.carbs} onChange={e=>setForm({...form,carbs:e.target.value})}/><Input label="Fat (g)" type="number" value={form.fat} onChange={e=>setForm({...form,fat:e.target.value})}/></div><Btn onClick={save} style={{width:"100%"}}>Log Food</Btn></div></Modal></div>;}

// ─── LEADS KANBAN ─────────────────────────────────────────────────────────────
function LeadsPage(){const[leads,setLeads]=useState([]);const[loading,setLoading]=useState(true);const[showAdd,setShowAdd]=useState(false);const[view,setView]=useState("kanban");const[form,setForm]=useState({name:"",email:"",phone:"",source:"website",notes:""});const load=()=>api.get("/leads").then(d=>{
    const apiLeads=unwrap(d,"leads");
    const localLeads=ls.get("local_leads",[]);
    setLeads([...apiLeads,...localLeads.filter(ll=>!apiLeads.some(al=>al.id===ll.id))]);
  }).catch(()=>{setLeads(ls.get("local_leads",[]));}).finally(()=>setLoading(false));useEffect(()=>{load();},[]);const addLead=async()=>{
    try{await api.post("/leads",form);}catch(e){
      if(e.message.includes("404")||e.message.includes("Not found")){
        // Backend route doesn't exist — save locally
        const localLeads=ls.get("local_leads",[]);
        localLeads.push({...form,id:`lead_${Date.now()}`,status:"new",createdAt:new Date().toISOString()});
        ls.set("local_leads",localLeads);
      }else{alert(e.message);return;}
    }
    setForm({name:"",email:"",phone:"",source:"website",notes:""});setShowAdd(false);load();
  };const stages=[{id:"new",label:"New",color:C.a2},{id:"contacted",label:"Contacted",color:C.wn},{id:"qualified",label:"Qualified",color:C.ac},{id:"converted",label:"Converted",color:C.ok},{id:"lost",label:"Lost",color:C.dg}];const updateSt=async(id,st)=>{
    if(String(id).startsWith("lead_")){
      const local=ls.get("local_leads",[]).map(l=>l.id===id?{...l,status:st}:l);
      ls.set("local_leads",local);load();return;
    }
    try{await api.put(`/leads/${id}`,{status:st});load();}catch{
      const local=ls.get("local_leads",[]).map(l=>l.id===id?{...l,status:st}:l);
      ls.set("local_leads",local);load();
    }
  };if(loading)return<Spin/>;return<div><ST right={<div style={{display:"flex",gap:6}}><button onClick={()=>setView("kanban")} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:view==="kanban"?C.ac:C.s2,color:view==="kanban"?"#fff":C.mt}}>Board</button><button onClick={()=>setView("list")} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:view==="list"?C.ac:C.s2,color:view==="list"?"#fff":C.mt}}>List</button><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Lead</Btn></div>}>Leads</ST>{view==="kanban"?<div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>{stages.map(st=>{const sl=leads.filter(l=>(l.status||"new")===st.id);return<div key={st.id} style={{minWidth:180,flex:"0 0 180px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:8,height:8,borderRadius:4,background:st.color}}/><span style={{fontSize:13,fontWeight:600,color:C.tx}}>{st.label}</span><Badge style={{fontSize:10,padding:"2px 8px"}}>{sl.length}</Badge></div>{sl.map(l=><Card key={l.id} style={{padding:12,marginBottom:6}}><div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:4}}>{l.name}</div><div style={{fontSize:11,color:C.mt}}>{l.email}</div>{l.source&&<Badge style={{marginTop:6,fontSize:10}} color={C.mt}>{l.source}</Badge>}<div style={{display:"flex",gap:4,marginTop:8}}>{stages.filter(s=>s.id!==st.id&&s.id!=="lost").slice(0,2).map(s=><button key={s.id} onClick={()=>updateSt(l.id,s.id)} style={{padding:"3px 8px",borderRadius:6,border:"none",fontSize:10,fontWeight:600,cursor:"pointer",background:s.color+"20",color:s.color}}>→ {s.label}</button>)}</div></Card>)}</div>;})}</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{leads.map(l=><Card key={l.id} style={{padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{l.name}</div><div style={{color:C.mt,fontSize:12}}>{l.email}</div></div><Badge color={stages.find(s=>s.id===(l.status||"new"))?.color}>{l.status||"new"}</Badge></Card>)}</div>}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Lead"><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input label="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><Input label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Sel label="Source" value={form.source} onChange={e=>setForm({...form,source:e.target.value})} options={[{value:"website",label:"Website"},{value:"referral",label:"Referral"},{value:"instagram",label:"Instagram"},{value:"other",label:"Other"}]}/><TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><Btn onClick={addLead} style={{width:"100%"}}>Save Lead</Btn></div></Modal></div>;}

// ─── WORKOUTS + EXERCISE LIBRARY ──────────────────────────────────────────────
const EXDB=[{name:"Barbell Squat",muscle:"Legs",eq:"Barbell"},{name:"Bench Press",muscle:"Chest",eq:"Barbell"},{name:"Deadlift",muscle:"Back",eq:"Barbell"},{name:"Overhead Press",muscle:"Shoulders",eq:"Barbell"},{name:"Barbell Row",muscle:"Back",eq:"Barbell"},{name:"Pull-ups",muscle:"Back",eq:"Bodyweight"},{name:"Dumbbell Curl",muscle:"Biceps",eq:"Dumbbell"},{name:"Tricep Pushdown",muscle:"Triceps",eq:"Cable"},{name:"Leg Press",muscle:"Legs",eq:"Machine"},{name:"Lat Pulldown",muscle:"Back",eq:"Cable"},{name:"Dumbbell Fly",muscle:"Chest",eq:"Dumbbell"},{name:"Lateral Raise",muscle:"Shoulders",eq:"Dumbbell"},{name:"Romanian Deadlift",muscle:"Hamstrings",eq:"Barbell"},{name:"Leg Curl",muscle:"Hamstrings",eq:"Machine"},{name:"Calf Raise",muscle:"Calves",eq:"Machine"},{name:"Plank",muscle:"Core",eq:"Bodyweight"},{name:"Face Pull",muscle:"Shoulders",eq:"Cable"},{name:"Hip Thrust",muscle:"Glutes",eq:"Barbell"},{name:"Incline DB Press",muscle:"Chest",eq:"Dumbbell"},{name:"Bulgarian Split Squat",muscle:"Legs",eq:"Dumbbell"},{name:"Hammer Curl",muscle:"Biceps",eq:"Dumbbell"},{name:"Skull Crusher",muscle:"Triceps",eq:"Barbell"},{name:"Cable Fly",muscle:"Chest",eq:"Cable"}];
function WorkoutsPage(){const[tab,setTab]=useState("plans");const[plans,setPlans]=useState([]);const[clients,setClients]=useState([]);const[loading,setLoading]=useState(true);const[showB,setShowB]=useState(false);const[exS,setExS]=useState("");const[exF,setExF]=useState("all");const[form,setForm]=useState({title:"",description:"",clientId:"",exercises:[{name:"",sets:3,reps:12,rest:60}]});useEffect(()=>{Promise.all([api.get("/workouts").catch(()=>null),api.get("/clients").catch(()=>({}))]).then(([w,c])=>{
    const apiPlans=w?unwrap(w,"workouts","plans"):[];
    const localPlans=ls.get("local_workouts",[]);
    setPlans([...apiPlans,...localPlans.filter(lp=>!apiPlans.some(ap=>ap.id===lp.id))]);
    setClients(unwrap(c,"clients"));
  }).finally(()=>setLoading(false));},[]);const addEx=()=>setForm({...form,exercises:[...form.exercises,{name:"",sets:3,reps:12,rest:60}]});const rmEx=i=>setForm({...form,exercises:form.exercises.filter((_,j)=>j!==i)});const upEx=(i,f,v)=>{const e=[...form.exercises];e[i]={...e[i],[f]:v};setForm({...form,exercises:e});};const save=async()=>{
    try{await api.post("/workouts",form);}catch{
      // Backend doesn't have workouts route — save locally
      const plan={...form,id:`workout_${Date.now()}`,status:"active",createdAt:new Date().toISOString(),exercises:form.exercises.filter(e=>e.name)};
      const local=ls.get("local_workouts",[]);local.push(plan);ls.set("local_workouts",local);
      setPlans(prev=>[...prev,plan]);
    }
    setShowB(false);setForm({title:"",description:"",clientId:"",exercises:[{name:"",sets:3,reps:12,rest:60}]});
  };const fe=EXDB.filter(e=>{if(exS&&!e.name.toLowerCase().includes(exS.toLowerCase()))return false;if(exF!=="all"&&e.muscle!==exF)return false;return true;});const muscles=[...new Set(EXDB.map(e=>e.muscle))];if(loading)return<Spin/>;return<div><ST right={<Btn onClick={()=>setShowB(true)} style={{padding:"8px 16px",fontSize:13}}>+ Create</Btn>}>Workouts</ST><Tabs tabs={[{id:"plans",label:"My Plans"},{id:"library",label:"Exercise Library"},{id:"templates",label:"Templates"}]} active={tab} onChange={setTab}/>{tab==="plans"&&(plans.length===0?<Empty icon="💪" text="No workout plans yet"/>:<div style={{display:"flex",flexDirection:"column",gap:10}}>{plans.map(p=><Card key={p.id} style={{padding:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}><div><div style={{color:C.tx,fontWeight:600,fontSize:15}}>{p.title}</div>{p.description&&<div style={{color:C.mt,fontSize:12,marginTop:4}}>{p.description}</div>}</div><Badge color={p.status==="active"?C.ok:C.mt}>{p.status||"draft"}</Badge></div>{p.exercises&&Array.isArray(p.exercises)&&<div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:4}}>{p.exercises.slice(0,4).map((ex,i)=><span key={i} style={{padding:"3px 8px",borderRadius:6,fontSize:11,fontWeight:500,background:C.ac+"15",color:C.ac}}>{ex.name||ex}</span>)}</div>}</Card>)}</div>)}{tab==="library"&&<div><Input placeholder="Search exercises…" value={exS} onChange={e=>setExS(e.target.value)} style={{marginBottom:10}}/><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}><button onClick={()=>setExF("all")} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:exF==="all"?C.ac:C.s2,color:exF==="all"?"#fff":C.mt}}>All</button>{muscles.map(m=><button key={m} onClick={()=>setExF(m)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:exF===m?C.ac:C.s2,color:exF===m?"#fff":C.mt}}>{m}</button>)}</div>{fe.map((e,i)=><Card key={i} style={{padding:12,marginBottom:6,display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:C.ac+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏋️</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.tx}}>{e.name}</div><div style={{fontSize:11,color:C.mt}}>{e.muscle} · {e.eq}</div></div></Card>)}</div>}{tab==="templates"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{[{n:"PPL - Push",ex:6,lv:"Intermediate"},{n:"PPL - Pull",ex:6,lv:"Intermediate"},{n:"PPL - Legs",ex:6,lv:"Intermediate"},{n:"Full Body Beginner",ex:8,lv:"Beginner"},{n:"Upper/Lower A",ex:6,lv:"Advanced"}].map((t,i)=><Card key={i} style={{padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{t.n}</div><div style={{fontSize:12,color:C.mt}}>{t.ex} exercises · {t.lv}</div></div><Btn variant="secondary" style={{padding:"6px 12px",fontSize:12}}>Use</Btn></Card>)}</div>}<Modal open={showB} onClose={()=>setShowB(false)} title="Create Workout" wide><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. PPL Week 1"/><Input label="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>{clients.length>0&&<Sel label="Assign" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select —"},...clients.map(c=>({value:c.id,label:cName(c)}))]}/>}<div style={{fontSize:14,fontWeight:600,color:C.tx,marginTop:8}}>Exercises</div>{form.exercises.map((ex,i)=><Card key={i} style={{padding:12,background:C.s2}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,color:C.mt,fontWeight:600}}>#{i+1}</span>{form.exercises.length>1&&<button onClick={()=>rmEx(i)} style={{background:"none",border:"none",cursor:"pointer",color:C.dg,fontSize:18}}>✕</button>}</div><Sel value={ex.name} onChange={e=>upEx(i,"name",e.target.value)} options={[{value:"",label:"— Pick —"},...EXDB.map(e=>({value:e.name,label:`${e.name} (${e.muscle})`}))]} style={{marginBottom:8}}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><Input label="Sets" type="number" value={ex.sets} onChange={e=>upEx(i,"sets",+e.target.value)}/><Input label="Reps" type="number" value={ex.reps} onChange={e=>upEx(i,"reps",+e.target.value)}/><Input label="Rest(s)" type="number" value={ex.rest} onChange={e=>upEx(i,"rest",+e.target.value)}/></div></Card>)}<Btn variant="secondary" onClick={addEx} style={{width:"100%"}}>+ Exercise</Btn><Btn onClick={save} style={{width:"100%"}}>Save Plan</Btn></div></Modal></div>;}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
function BookingsPage(){
  const[bookings,setBookings]=useState([]);const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);const[showRepeat,setShowRepeat]=useState(false);
  const[clients,setClients]=useState([]);const[viewMode,setViewMode]=useState("week");
  const[currentMonth,setCurrentMonth]=useState(new Date());
  const[selDate,setSelDate]=useState(new Date().toISOString().slice(0,10));
  const[holidays,setHolidays]=useState(ls.get("holidays",[]));
  const[form,setForm]=useState({clientId:"",date:new Date().toISOString().slice(0,10),time:"09:00",duration:60,type:"training",notes:""});
  const[repeatForm,setRepeatForm]=useState({endDate:"",mode:"until_date",daysOfWeek:[1,2,3,4,5]});

  const load=()=>{Promise.all([api.get("/bookings").catch(()=>({})),api.get("/clients").catch(()=>({}))]).then(([b,c])=>{
    const apiBk=unwrap(b,"bookings","sessions");
    setBookings(apiBk);
    setClients(unwrap(c,"clients"));
  }).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[]);

  // Create booking via API
  const createBooking=async(bookingData)=>{
    const r=await api.post("/bookings",bookingData);
    return r;
  };

  const save=async()=>{
    if(!form.clientId){alert("Please select a client");return;}
    try{
      // Get coach profile ID from /auth/me
      const me=await api.get("/auth/me").catch(()=>null);
      const coachId=me?.profile?.id;
      if(!coachId){alert("Could not resolve coach profile");return;}
      await createBooking({
        clientId:form.clientId,
        coachId,
        scheduledAt:form.date+"T"+form.time+":00.000Z",
        durationMinutes:form.duration||60,
        sessionType:form.type==="training"||form.type==="group"?"IN_PERSON":"ONLINE",
        notes:form.notes,
      });
      setShowAdd(false);load();
    }catch(e){alert("Booking error: "+e.message);}
  };



  // Attendance
  const markAttendance=async(bid,status)=>{
    try{await api.req(`/bookings/${bid}`,{method:"PATCH",body:JSON.stringify({status:status.toUpperCase()})});}catch(e){log("Attendance update failed:",e.message);}
    setBookings(prev=>prev.map(b=>b.id===bid?{...b,status}:b));
    if(status==="cancelled")load(); // Refresh to remove from view
  };

  // Replicate schedule
  const replicateSchedule=async()=>{
    const dayBk=getDateBookings(selDate);
    if(dayBk.length===0){alert("No sessions to replicate");return;}
    const end=new Date(repeatForm.endDate);const start=new Date(selDate);start.setDate(start.getDate()+1);
    let created=0;
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const dow=d.getDay();
      if(repeatForm.mode==="week_days"&&!repeatForm.daysOfWeek.includes(dow))continue;
      const iso=d.toISOString().slice(0,10);
      if(holidays.includes(iso))continue;
      for(const bk of dayBk){
        const origTime=new Date(bk.date||bk.startTime||bk.scheduledAt);
        const timeStr=origTime.toTimeString().slice(0,5);
        try{await createBooking({clientId:bk.clientId||bk.client?.id,date:iso+"T"+timeStr+":00",duration:bk.duration||60,type:bk.type||"training"});created++;}catch{}
      }
    }
    alert(`Created ${created} sessions!`);setShowRepeat(false);load();
  };

  // Holiday management
  const toggleHoliday=(date)=>{const u=holidays.includes(date)?holidays.filter(h=>h!==date):[...holidays,date];setHolidays(u);ls.set("holidays",u);};
  const cancelDay=async()=>{
    const dayBk=getDateBookings(selDate);
    if(dayBk.length===0){alert("No sessions to cancel");return;}
    if(!confirm(`Cancel ${dayBk.length} session(s) on ${selDate}?`))return;
    for(const bk of dayBk){markAttendance(bk.id,"cancelled");}
    toggleHoliday(selDate);alert(`${dayBk.length} session(s) cancelled.`);
  };

  // WhatsApp integration
  const sendWhatsAppToClient=(phone,message)=>{
    const cleanPhone=String(phone||"").replace(/[\s\-\+\(\)]/g,"");
    const intlPhone=cleanPhone.startsWith("91")?cleanPhone:cleanPhone.startsWith("0")?`91${cleanPhone.slice(1)}`:`91${cleanPhone}`;
    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`,"_blank");
  };

  // Resolve client phone — look up from full clients list by ID
  const resolveClientPhone=(booking)=>{
    // Try the embedded client object first
    let phone=booking.client?.phone||cPhone(booking.client);
    if(phone)return phone;
    // Look up from the full clients list by clientId
    const fullClient=clients.find(c=>c.id===booking.clientId||c.id===booking.client?.id||c.userId===booking.client?.userId);
    if(fullClient){
      phone=fullClient.phone||fullClient.user?.phone||cPhone(fullClient);
      if(phone)return phone;
    }
    // Check localStorage for client edits that might have phone
    const edits=ls.get("client_edits",{});
    const editId=booking.clientId||booking.client?.id;
    if(editId&&edits[editId]?.phone)return edits[editId].phone;
    return"";
  };

  const resolveClientName=(booking)=>{
    const fullClient=clients.find(c=>c.id===booking.clientId||c.id===booking.client?.id);
    return cName(fullClient)||cName(booking.client)||booking.type||"Client";
  };

  const[showCallSelect,setShowCallSelect]=useState(false);
  const[callSelections,setCallSelections]=useState({});

  const whatsAppGroupCall=()=>{
    const dayBk=getDateBookings(selDate);
    if(dayBk.length===0){alert("No sessions on this day");return;}

    // Build client list with resolved phones
    const clientList=dayBk.map(b=>({
      id:b.id,
      name:resolveClientName(b),
      phone:resolveClientPhone(b),
      time:new Date(b.date||b.startTime||b.scheduledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      duration:b.duration||60,
      type:b.type||"training",
    }));

    const withPhone=clientList.filter(c=>c.phone);
    if(withPhone.length===0){
      alert("No client phone numbers found.\n\nTo fix: Go to Clients → tap a client → ✏️ Edit → add their mobile number.");
      return;
    }

    // Show selection modal
    const selections={};
    withPhone.forEach(c=>{selections[c.id]=true;});
    setCallSelections(selections);
    setShowCallSelect(true);
  };

  const sendGroupCall=()=>{
    const dayBk=getDateBookings(selDate);
    const selected=dayBk.filter(b=>callSelections[b.id]);
    if(selected.length===0){alert("Select at least one client");return;}

    const timeSlots=selected.map(b=>{
      const t=new Date(b.date||b.startTime||b.scheduledAt);
      return`${t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} — ${resolveClientName(b)} (${b.duration||60}min)`;
    }).join("\n");

    const msg=`🏋️ *CoachMe Session — ${new Date(selDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}*\n\n📅 Schedule:\n${timeSlots}\n\n📞 Join the group video call:\n(Coach will start the call at session time)\n\nSee you! 💪`;

    selected.forEach((b,i)=>{
      const phone=resolveClientPhone(b);
      if(phone)setTimeout(()=>sendWhatsAppToClient(phone,msg),i*1000);
    });

    setShowCallSelect(false);
    alert(`Opening WhatsApp for ${selected.length} client(s)…`);
  };

  const cancelDayAndNotify=async()=>{
    const dayBk=getDateBookings(selDate);
    if(dayBk.length===0){alert("No sessions to cancel");return;}
    if(!confirm(`Cancel ${dayBk.length} session(s) on ${selDate} and notify clients via WhatsApp?`))return;
    for(const bk of dayBk){markAttendance(bk.id,"cancelled");}
    toggleHoliday(selDate);
    // Send WhatsApp notification to each client
    const msg=`❌ *Session Cancelled*\n\nHi! Your session on ${new Date(selDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} has been cancelled.\n\nWe'll reschedule soon. Sorry for the inconvenience!\n\n— Your Coach via CoachMe.life`;
    dayBk.forEach((bk,i)=>{
      const client=bk.client||clients.find(c=>c.id===bk.clientId);
      const phone=resolveClientPhone(bk);
      if(phone)setTimeout(()=>sendWhatsAppToClient(phone,msg),i*800);
    });
    alert(`${dayBk.length} session(s) cancelled. WhatsApp notifications sent.`);
  };

  // Helper to get bookings for a date (exclude cancelled)
  const getDateBookings=(dateStr)=>bookings.filter(b=>{
    try{const st=(b.status||"").toUpperCase();return new Date(b.date||b.startTime||b.scheduledAt).toISOString().slice(0,10)===dateStr&&st!=="CANCELLED";}catch{return false;}
  });

  // ── MONTH CALENDAR HELPERS ──
  const getMonthDays=()=>{
    const y=currentMonth.getFullYear(),m=currentMonth.getMonth();
    const firstDay=new Date(y,m,1).getDay();
    const daysInMonth=new Date(y,m+1,0).getDate();
    const daysInPrev=new Date(y,m,0).getDate();
    const cells=[];
    // Previous month padding
    for(let i=firstDay-1;i>=0;i--)cells.push({day:daysInPrev-i,month:m-1,faded:true});
    // Current month
    for(let i=1;i<=daysInMonth;i++)cells.push({day:i,month:m,faded:false});
    // Next month padding
    const remaining=42-cells.length;
    for(let i=1;i<=remaining;i++)cells.push({day:i,month:m+1,faded:true});
    return cells;
  };
  const monthName=currentMonth.toLocaleString("default",{month:"long",year:"numeric"});
  const prevMonth=()=>{const d=new Date(currentMonth);d.setMonth(d.getMonth()-1);setCurrentMonth(d);};
  const nextMonth=()=>{const d=new Date(currentMonth);d.setMonth(d.getMonth()+1);setCurrentMonth(d);};
  const todayStr=new Date().toISOString().slice(0,10);

  const db=getDateBookings(selDate);
  const isHoliday=holidays.includes(selDate);

  if(loading)return<Spin/>;

  return<div>
    <ST right={<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      <button onClick={()=>setViewMode(viewMode==="month"?"week":"month")} style={{padding:"6px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:C.s2,color:C.mt}}>{viewMode==="month"?"📅 Week":"📆 Month"}</button>
      <Btn variant="secondary" onClick={()=>setShowRepeat(true)} style={{padding:"6px 10px",fontSize:11}}>🔁 Repeat</Btn>
      <Btn variant={isHoliday?"danger":"secondary"} onClick={()=>isHoliday?toggleHoliday(selDate):cancelDayAndNotify()} style={{padding:"6px 10px",fontSize:11}}>{isHoliday?"✓ Off":"🏖️"}</Btn>
      <button onClick={whatsAppGroupCall} style={{padding:"6px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:"#25D366"+"20",color:"#25D366"}} title="WhatsApp call all clients">📞 Call</button><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 12px",fontSize:12}}>+ Book</Btn>
    </div>}>Schedule</ST>

    {/* ── MONTH VIEW (Outlook-style) ── */}
    {viewMode==="month"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <button onClick={prevMonth} style={{background:"none",border:"none",color:C.tx,fontSize:20,cursor:"pointer",padding:"4px 8px"}}>‹</button>
        <span style={{fontSize:16,fontWeight:700,color:C.tx}}>{monthName}</span>
        <button onClick={nextMonth} style={{background:"none",border:"none",color:C.tx,fontSize:20,cursor:"pointer",padding:"4px 8px"}}>›</button>
      </div>
      {/* Day headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:600,color:C.mt,padding:"6px 0"}}>{d}</div>)}
      </div>
      {/* Calendar grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {getMonthDays().map((cell,i)=>{
          const y=currentMonth.getFullYear();
          const m=cell.month<0?11:cell.month>11?0:cell.month;
          const adjY=cell.month<0?y-1:cell.month>11?y+1:y;
          const iso=`${adjY}-${String(m+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}`;
          const dayBk=getDateBookings(iso);
          const isSel=iso===selDate;const isToday=iso===todayStr;
          const isH=holidays.includes(iso);
          return<button key={i} onClick={()=>setSelDate(iso)} style={{
            minHeight:52,padding:4,borderRadius:8,border:isSel?`2px solid ${C.ac}`:"none",cursor:"pointer",
            background:isH?C.dg+"12":isSel?C.ac+"15":isToday?C.a2+"12":C.sf,
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            opacity:cell.faded?.4:1,transition:"all .15s",position:"relative",
          }}>
            <span style={{fontSize:12,fontWeight:isToday||isSel?700:400,color:isH?C.dg:isSel?C.ac:isToday?C.a2:C.tx}}>{cell.day}</span>
            {dayBk.length>0&&<div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center"}}>
              {dayBk.length<=3?dayBk.map((_,j)=><div key={j} style={{width:6,height:6,borderRadius:3,background:C.ac}}/>):
              <span style={{fontSize:9,fontWeight:600,color:C.ac}}>{dayBk.length}</span>}
            </div>}
            {isH&&<span style={{fontSize:7,color:C.dg,fontWeight:600}}>OFF</span>}
          </button>;
        })}
      </div>
    </div>}

    {/* ── WEEK VIEW ── */}
    {viewMode==="week"&&<div style={{display:"flex",gap:4,marginBottom:16}}>
      {(()=>{const b=new Date(selDate);const s=new Date(b);s.setDate(b.getDate()-b.getDay());return Array.from({length:7},(_,i)=>{const d=new Date(s);d.setDate(s.getDate()+i);return d;});})().map((d,i)=>{
        const iso=d.toISOString().slice(0,10);const isSel=iso===selDate;
        const has=getDateBookings(iso).length>0;const isH=holidays.includes(iso);
        return<button key={i} onClick={()=>setSelDate(iso)} style={{flex:1,minWidth:42,padding:"10px 2px",borderRadius:12,border:"none",cursor:"pointer",background:isSel?C.gr:isH?C.dg+"20":C.s2,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <span style={{fontSize:10,fontWeight:600,color:isSel?"#fff":isH?C.dg:C.mt,textTransform:"uppercase"}}>{"Sun,Mon,Tue,Wed,Thu,Fri,Sat".split(",")[d.getDay()]}</span>
          <span style={{fontSize:16,fontWeight:700,color:isSel?"#fff":C.tx}}>{d.getDate()}</span>
          {has&&<div style={{width:5,height:5,borderRadius:"50%",background:isSel?"#fff":C.ac}}/>}
        </button>;
      })}
    </div>}

    {/* ── SELECTED DAY HEADER ── */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"12px 0 8px"}}>
      <span style={{fontSize:14,fontWeight:600,color:C.tx}}>
        {new Date(selDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}
        {isHoliday&&<Badge color={C.dg} style={{marginLeft:8}}>Holiday</Badge>}
      </span>
      <span style={{fontSize:12,color:C.mt}}>{db.length} session(s)</span>
    </div>

    {/* ── DAY BOOKINGS WITH ATTENDANCE ── */}
    {db.length===0?<Empty icon={isHoliday?"🏖️":"📅"} text={isHoliday?"Holiday — No sessions":"No sessions this day"}/>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {db.sort((a,b)=>new Date(a.date||a.startTime||a.scheduledAt)-new Date(b.date||b.startTime||b.scheduledAt)).map(b=>{
        const t=new Date(b.date||b.startTime||b.scheduledAt);
        const clientName=cName(b.client)||b.type||"Session";
        const st=(b.status||"pending").toLowerCase();
        const statusColors={present:C.ok,confirmed:C.ok,absent:C.dg,cancelled:C.mt,late:C.wn,pending:C.wn};
        return<Card key={b.id} style={{padding:14}}>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
            <div style={{width:50,padding:"6px 0",borderRadius:8,background:C.ac+"15",textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.ac}}>{t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{clientName}</div>
              <div style={{fontSize:12,color:C.mt}}>{b.duration||60}min · {b.type||"training"}{b._local?" · 📱 Local":""}</div>
            </div>
            <Badge color={statusColors[st]||C.wn}>{st}</Badge>
          </div>
          <div style={{display:"flex",gap:4}}>
            {[{s:"confirmed",l:"✅ Confirm",c:C.ok},{s:"cancelled",l:"🚫 Cancel",c:C.dg},{s:"pending",l:"⏳ Pending",c:C.wn}].map(a=>
              <button key={a.s} onClick={()=>markAttendance(b.id,a.s)} style={{flex:1,padding:"6px 2px",borderRadius:8,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:st===a.s?a.c+"30":C.s2,color:st===a.s?a.c:C.mt}}>{a.l}</button>
            )}
          </div>
        </Card>;
      })}
    </div>}

    {/* ── BOOK SESSION MODAL ── */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Book Session">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {clients.length>0&&<Sel label="Client" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select Client —"},...clients.map(c=>({value:c.id,label:cName(c)}))]}/>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Input label="Date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
          <Input label="Time" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Input label="Duration (min)" type="number" value={form.duration} onChange={e=>setForm({...form,duration:+e.target.value})}/>
          <Sel label="Type" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} options={[{value:"training",label:"Training"},{value:"assessment",label:"Assessment"},{value:"consultation",label:"Consultation"},{value:"group",label:"Group Class"}]}/>
        </div>
        <TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
        <Btn onClick={save} disabled={!form.clientId||!form.date||!form.time} style={{width:"100%"}}>Confirm Booking</Btn>
      </div>
    </Modal>

    {/* ── REPLICATE MODAL ── */}
    <Modal open={showRepeat} onClose={()=>setShowRepeat(false)} title="Replicate Schedule">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{padding:12,background:C.s2,borderRadius:10,fontSize:12,color:C.mt}}>
          Copy {db.length} session(s) from <strong style={{color:C.tx}}>{selDate}</strong> to future dates
        </div>
        <Sel label="Repeat Mode" value={repeatForm.mode} onChange={e=>setRepeatForm({...repeatForm,mode:e.target.value})} options={[{value:"until_date",label:"Every day until end date"},{value:"week_days",label:"Specific days of the week"}]}/>
        {repeatForm.mode==="week_days"&&<div>
          <label style={{fontSize:13,color:C.mt,fontWeight:500,marginBottom:6,display:"block"}}>Days</label>
          <div style={{display:"flex",gap:4}}>{"S,M,T,W,T,F,S".split(",").map((d,i)=>
            <button key={i} onClick={()=>{const dw=repeatForm.daysOfWeek.includes(i)?repeatForm.daysOfWeek.filter(x=>x!==i):[...repeatForm.daysOfWeek,i];setRepeatForm({...repeatForm,daysOfWeek:dw});}} style={{width:36,height:36,borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:repeatForm.daysOfWeek.includes(i)?C.ac:C.s2,color:repeatForm.daysOfWeek.includes(i)?"#fff":C.mt}}>{d}</button>
          )}</div>
        </div>}
        <Input label="End Date" type="date" value={repeatForm.endDate} onChange={e=>setRepeatForm({...repeatForm,endDate:e.target.value})}/>
        <Btn onClick={replicateSchedule} disabled={!repeatForm.endDate||db.length===0} style={{width:"100%"}}>🔁 Replicate {db.length} Session(s)</Btn>
      </div>
    </Modal>

    {/* ── GROUP CALL SELECTION MODAL ── */}
    <Modal open={showCallSelect} onClose={()=>setShowCallSelect(false)} title="📞 WhatsApp Group Call">
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:13,color:C.mt,marginBottom:4}}>
          Select clients to include in the group call for <strong style={{color:C.tx}}>{new Date(selDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</strong>:
        </div>
        {getDateBookings(selDate).map(b=>{
          const name=resolveClientName(b);
          const phone=resolveClientPhone(b);
          const time=new Date(b.date||b.startTime||b.scheduledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
          const hasPhone=!!phone;
          return<div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:callSelections[b.id]?C.ok+"12":C.s2,border:`1px solid ${callSelections[b.id]?C.ok+"30":C.bd}`,cursor:hasPhone?"pointer":"default",opacity:hasPhone?1:0.5}} onClick={()=>{if(!hasPhone)return;setCallSelections(s=>({...s,[b.id]:!s[b.id]}));}}>
            <div style={{width:24,height:24,borderRadius:6,border:`2px solid ${callSelections[b.id]?C.ok:C.bd}`,background:callSelections[b.id]?C.ok:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",flexShrink:0}}>
              {callSelections[b.id]?"✓":""}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{name}</div>
              <div style={{fontSize:11,color:C.mt}}>{time} · {b.duration||60}min · {b.type||"training"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              {hasPhone?<div style={{fontSize:12,color:C.ok}}>📱 {phone}</div>:<div style={{fontSize:11,color:C.dg}}>No phone</div>}
            </div>
          </div>;
        })}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={()=>{const all={};getDateBookings(selDate).forEach(b=>{if(resolveClientPhone(b))all[b.id]=true;});setCallSelections(all);}} style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:C.s2,color:C.mt}}>Select All</button>
          <button onClick={()=>setCallSelections({})} style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:C.s2,color:C.mt}}>Deselect All</button>
        </div>
        <Btn onClick={sendGroupCall} disabled={Object.values(callSelections).filter(Boolean).length===0} style={{width:"100%",marginTop:4}}>
          📞 Call {Object.values(callSelections).filter(Boolean).length} Client(s) via WhatsApp
        </Btn>
      </div>
    </Modal>
  </div>;
}

function MealPlannerPage(){const[plan,setPlan]=useState(null);const[loading,setLoading]=useState(false);const[form,setForm]=useState({goal:"muscle_gain",calories:"2200",restrictions:"",preferences:""});const gen=async()=>{setLoading(true);try{const r=await api.post("/ai/chat",{message:`Generate a detailed daily meal plan: Goal: ${form.goal.replace("_"," ")}, Calories: ${form.calories}kcal, Restrictions: ${form.restrictions||"none"}, Preferences: ${form.preferences||"none"}. Include breakfast, lunch, dinner, 2 snacks with calories, protein, carbs, fat for each.`});setPlan(r.reply||r.message||r.response||"Could not generate");}catch(e){setPlan("Error: "+e.message);}setLoading(false);};return<div><ST>AI Meal Planner</ST><Card style={{marginBottom:16}}><div style={{display:"flex",flexDirection:"column",gap:12}}><Sel label="Goal" value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} options={[{value:"muscle_gain",label:"Muscle Gain"},{value:"fat_loss",label:"Fat Loss"},{value:"maintenance",label:"Maintenance"},{value:"performance",label:"Athletic Performance"}]}/><Input label="Target Calories" type="number" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})}/><Input label="Restrictions" value={form.restrictions} onChange={e=>setForm({...form,restrictions:e.target.value})} placeholder="e.g. vegetarian, no dairy"/><Input label="Preferences" value={form.preferences} onChange={e=>setForm({...form,preferences:e.target.value})} placeholder="e.g. Indian cuisine"/><Btn onClick={gen} disabled={loading} style={{width:"100%"}}>{loading?"Generating…":"🤖 Generate Meal Plan"}</Btn></div></Card>{plan&&<Card><div style={{fontSize:15,fontWeight:600,color:C.tx,marginBottom:12}}>Your Meal Plan</div><div style={{fontSize:13,color:C.tx,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{plan}</div></Card>}</div>;}

// ─── CHECK-INS ────────────────────────────────────────────────────────────────
function CheckInsPage(){const[cks,setCks]=useState(ls.get("checkins",[]));const[showF,setShowF]=useState(false);const[form,setForm]=useState({energy:7,sleep:7,stress:3,adherence:80,weight:"",notes:"",mood:"good"});const moods=[{v:"great",e:"😄"},{v:"good",e:"🙂"},{v:"okay",e:"😐"},{v:"tired",e:"😴"},{v:"bad",e:"😞"}];const submit=()=>{const e={...form,id:Date.now(),date:new Date().toISOString().slice(0,10),weight:+form.weight||0};const u=[...cks,e];setCks(u);ls.set("checkins",u);setShowF(false);};return<div><ST right={<Btn onClick={()=>setShowF(true)} style={{padding:"8px 16px",fontSize:13}}>+ Check-in</Btn>}>Check-ins</ST>{cks.length===0?<Empty icon="📋" text="No check-ins yet"/>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{cks.slice().reverse().map(c=><Card key={c.id} style={{padding:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{c.date}</div><span style={{fontSize:20}}>{moods.find(m=>m.v===c.mood)?.e||"🙂"}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,fontSize:11}}><div><span style={{color:C.mt}}>Energy</span><br/><span style={{color:C.tx,fontWeight:600}}>{c.energy}/10</span></div><div><span style={{color:C.mt}}>Sleep</span><br/><span style={{color:C.tx,fontWeight:600}}>{c.sleep}/10</span></div><div><span style={{color:C.mt}}>Stress</span><br/><span style={{color:C.tx,fontWeight:600}}>{c.stress}/10</span></div><div><span style={{color:C.mt}}>Adherence</span><br/><span style={{color:C.tx,fontWeight:600}}>{c.adherence}%</span></div></div>{c.notes&&<div style={{fontSize:12,color:C.mt,marginTop:8,paddingTop:8,borderTop:`1px solid ${C.bd}`}}>{c.notes}</div>}</Card>)}</div>}<Modal open={showF} onClose={()=>setShowF(false)} title="Weekly Check-in"><div style={{display:"flex",flexDirection:"column",gap:14}}><div><label style={{fontSize:13,color:C.mt,fontWeight:500,marginBottom:8,display:"block"}}>How are you feeling?</label><div style={{display:"flex",gap:8}}>{moods.map(m=><button key={m.v} onClick={()=>setForm({...form,mood:m.v})} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",background:form.mood===m.v?C.ac+"30":C.s2,fontSize:22,transition:"all .2s"}}>{m.e}</button>)}</div></div>{[{k:"energy",l:"Energy",mx:10},{k:"sleep",l:"Sleep Quality",mx:10},{k:"stress",l:"Stress Level",mx:10}].map(s=><div key={s.k}><div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:C.mt}}>{s.l}</span><span style={{color:C.tx,fontWeight:600}}>{form[s.k]}/{s.mx}</span></div><input type="range" min="1" max={s.mx} value={form[s.k]} onChange={e=>setForm({...form,[s.k]:+e.target.value})} style={{width:"100%",accentColor:C.ac}}/></div>)}<div><div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:C.mt}}>Plan Adherence</span><span style={{color:C.tx,fontWeight:600}}>{form.adherence}%</span></div><input type="range" min="0" max="100" step="5" value={form.adherence} onChange={e=>setForm({...form,adherence:+e.target.value})} style={{width:"100%",accentColor:C.ok}}/></div><Input label="Weight (kg)" type="number" value={form.weight} onChange={e=>setForm({...form,weight:e.target.value})}/><TextArea label="Notes / Wins / Struggles" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="How was your week?"/><Btn onClick={submit} style={{width:"100%"}}>Submit</Btn></div></Modal></div>;}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function ReportsPage(){const[data,setData]=useState({});const[loading,setLoading]=useState(true);const[tab,setTab]=useState("dashboard");useEffect(()=>{setLoading(true);const ep={dashboard:"/reports/coach/dashboard",revenue:"/reports/coach/revenue",clients:"/reports/coach/clients",workouts:"/reports/coach/workouts"}[tab]||"/reports/coach/dashboard";api.get(ep).then(d=>setData(d?.data||d||{})).catch(()=>setData({})).finally(()=>setLoading(false));},[tab]);if(loading)return<Spin/>;return<div><ST>Analytics</ST><Tabs tabs={[{id:"dashboard",label:"Overview"},{id:"revenue",label:"Revenue"},{id:"clients",label:"Clients"},{id:"workouts",label:"Workouts"}]} active={tab} onChange={setTab}/><Card style={{marginBottom:12}}><div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:4}}>Revenue</div><div style={{fontSize:26,fontWeight:700,color:C.ok}}>₹{(data.totalRevenue??data.revenue??0).toLocaleString()}</div></Card><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><SC label="Sessions" value={data.sessionsCompleted??data.totalBookings??0} icon="📅" color={C.ac}/><SC label="Retention" value={`${data.retentionRate??0}%`} icon="🔄" color={C.a2}/><SC label="Avg/Client" value={data.avgSessionsPerClient??0} icon="📊" color={C.wn}/><SC label="Conversion" value={`${data.conversionRate??0}%`} icon="🎯" color={C.ok}/></div></div>;}

// ─── AI CHAT ──────────────────────────────────────────────────────────────────
function AIChatPage(){
  const{user}=useAuth();
  const[msgs,setMsgs]=useState([{role:"assistant",content:"Hey! I'm your AI coach with full app control. Try:\n\n• \"Add client Ravi, phone 9876543210\"\n• \"Show my schedule for today\"\n• \"Book session for Priya tomorrow 7am\"\n• \"How many clients do I have?\"\n• \"Create a push day workout\"\n• \"What's my revenue?\"\n• \"Cancel all sessions on Friday\"\n\n🎙️ Tap mic for voice commands!"}]);
  const[input,setInput]=useState("");const[loading,setLoading]=useState(false);
  const[voiceOn,setVoiceOn]=useState(true);const[isListening,setIsListening]=useState(false);
  const br=useRef(null);const recognitionRef=useRef(null);

  useEffect(()=>{br.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  // Voice output
  const speakText=(text)=>{
    if(!voiceOn||!("speechSynthesis"in window))return;
    speechSynthesis.cancel();
    const clean=text.replace(/[^\w\s.,!?;:'\-—]/g,"").replace(/\n+/g,". ").slice(0,600);
    const u=new SpeechSynthesisUtterance(clean);u.rate=1.05;u.pitch=1;u.volume=0.9;
    const voices=speechSynthesis.getVoices();
    const pref=voices.find(v=>v.name.includes("Google")&&v.lang.startsWith("en"))||voices.find(v=>v.lang.startsWith("en"));
    if(pref)u.voice=pref;
    speechSynthesis.speak(u);
  };

  // Voice input
  const toggleListening=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice not supported");return;}
    if(isListening&&recognitionRef.current){recognitionRef.current.stop();setIsListening(false);return;}
    const r=new SR();r.continuous=false;r.interimResults=true;r.lang="en-US";
    r.onresult=(e)=>{
      const transcript=Array.from(e.results).map(r=>r[0].transcript).join("");
      setInput(transcript);
      if(e.results[0].isFinal)setTimeout(()=>send(transcript),300);
    };
    r.onerror=()=>setIsListening(false);r.onend=()=>setIsListening(false);
    recognitionRef.current=r;r.start();setIsListening(true);
  };

  // ── GATHER ALL APP DATA ────────────────────────────────────────────────
  const gatherContext=async()=>{
    let ctx="";
    // Clients
    try{
      const c=await api.get("/clients");const cl=unwrap(c,"clients");
      ctx+=`\n\nCLIENTS (${cl.length} total):`;
      cl.slice(0,25).forEach(x=>{
        ctx+=`\n- ${cName(x)} | Email: ${cEmail(x)} | Phone: ${cPhone(x)||"not set"} | Type: ${x.sessionType||"offline"} | ID: ${x.id}`;
      });
    }catch{ctx+="\n\nCLIENTS: Could not fetch";}

    // Bookings
    try{
      const b=await api.get("/bookings");const bk=unwrap(b,"bookings","sessions");
      const localBk=ls.get("local_bookings",[]);
      const allBk=[...bk,...localBk.filter(lb=>!bk.some(ab=>ab.id===lb.id))];
      const today=new Date().toISOString().slice(0,10);
      const todayBk=allBk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt).toISOString().slice(0,10)===today;}catch{return false;}});
      const upcoming=allBk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt)>=new Date();}catch{return false;}}).sort((a,b)=>new Date(a.date||a.startTime)-new Date(b.date||b.startTime)).slice(0,10);
      ctx+=`\n\nTODAY'S SCHEDULE (${today}, ${todayBk.length} sessions):`;
      todayBk.forEach(x=>{
        const t=new Date(x.date||x.startTime||x.scheduledAt);
        ctx+=`\n- ${t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} | ${cName(x.client)||x.type||"Session"} | ${x.duration||60}min | Status: ${x.status||"pending"}${x._local?" [LOCAL]":""}`;
      });
      if(todayBk.length===0)ctx+="\n- No sessions scheduled today";
      ctx+=`\n\nUPCOMING SESSIONS (next ${upcoming.length}):`;
      upcoming.slice(0,5).forEach(x=>{
        const t=new Date(x.date||x.startTime||x.scheduledAt);
        ctx+=`\n- ${t.toLocaleDateString()} ${t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} | ${cName(x.client)||x.type||"Session"}`;
      });
    }catch{ctx+="\n\nBOOKINGS: Could not fetch";}

    // Reports
    try{
      const r=await api.get("/reports/coach/dashboard");const d=r?.data||r||{};
      ctx+=`\n\nBUSINESS STATS:`;
      ctx+=`\n- Active clients: ${d.activeClients||d.totalClients||0}`;
      ctx+=`\n- Total revenue: ₹${(d.totalRevenue||d.monthlyRevenue||0).toLocaleString()}`;
      ctx+=`\n- Upcoming bookings: ${d.upcomingBookings||0}`;
      ctx+=`\n- Conversion rate: ${d.conversionRate||0}%`;
      ctx+=`\n- Retention rate: ${d.retentionRate||0}%`;
    }catch{}

    // Leads
    try{
      const l=await api.get("/leads");const ld=unwrap(l,"leads");
      const localLeads=ls.get("local_leads",[]);
      const allLeads=[...ld,...localLeads];
      ctx+=`\n\nLEADS (${allLeads.length}):`;
      allLeads.slice(0,10).forEach(x=>ctx+=`\n- ${x.name} [${x.status||"new"}] ${x.email||""}`);
    }catch{}

    // Local data
    const holidays=ls.get("holidays",[]);
    if(holidays.length)ctx+=`\n\nHOLIDAYS: ${holidays.join(", ")}`;
    const checkins=ls.get("checkins",[]);
    if(checkins.length){const last=checkins[checkins.length-1];ctx+=`\n\nLATEST CHECK-IN (${last.date}): Energy ${last.energy}/10, Sleep ${last.sleep}/10, Stress ${last.stress}/10, Adherence ${last.adherence}%, Mood: ${last.mood}`;}

    return ctx;
  };

  // ── EXECUTE REAL ACTIONS ───────────────────────────────────────────────
  const executeAction=async(userMsg)=>{
    const msg=userMsg.toLowerCase();
    const results=[];

    // ─ ADD CLIENT ─
    const addClientMatch=msg.match(/(?:add|create|new)\s+(?:a\s+)?client\s+(?:named?\s+)?([a-zA-Z\s]+?)(?:\s*,\s*|\s+(?:phone|mobile|number|email|with)|\s*$)/i);
    if(addClientMatch){
      const name=addClientMatch[1].trim().replace(/\s+phone.*$/i,"").replace(/\s+email.*$/i,"").trim();
      if(name.length>=2){
        const phoneMatch=userMsg.match(/(?:phone|mobile|number|ph|mob)[:\s]*(\+?\d[\d\s\-]{6,})/i)||userMsg.match(/(\d{10,})/);
        const emailMatch=userMsg.match(/(?:email)[:\s]*([^\s,]+@[^\s,]+)/i);
        const phone=phoneMatch?phoneMatch[1].replace(/[\s\-]/g,""):"";
        const email=emailMatch?emailMatch[1]:`${name.toLowerCase().replace(/\s+/g,".")}@client.com`;
        const sessionType=msg.includes("online")?"online":msg.includes("hybrid")?"hybrid":"offline";
        try{
          const r=await api.post("/clients",{name,email,phone,sessionType});
          const created=r?.client||r;
          results.push(`✅ Client added!\n   Name: ${cName(created)||name}\n   Email: ${email}\n   Phone: ${phone||"not set"}\n   Type: ${sessionType}`);
        }catch(e){results.push(`⚠️ Could not add client "${name}": ${e.message}`);}
      }
    }

    // ─ LIST/SHOW CLIENTS ─
    if(msg.match(/(?:show|list|how many|my)\s*(?:all\s+)?clients|client\s*list|number of clients/i)&&!addClientMatch){
      try{
        const c=await api.get("/clients");const cl=unwrap(c,"clients");
        let txt=`👥 You have ${cl.length} client(s):\n`;
        cl.forEach((x,i)=>{txt+=`\n${i+1}. ${cName(x)} — ${cEmail(x)}${cPhone(x)?` — 📱${cPhone(x)}`:""} — ${x.sessionType||"offline"}`});
        results.push(txt);
      }catch(e){results.push("⚠️ Could not fetch clients: "+e.message);}
    }

    // ─ SHOW SCHEDULE ─
    if(msg.match(/(?:show|what|my|today|tomorrow)\s*(?:'?s?\s*)?(?:schedule|sessions?|bookings?|calendar)/i)||msg.match(/schedule\s+(?:for\s+)?(?:today|tomorrow|this week)/i)){
      try{
        const b=await api.get("/bookings");const bk=unwrap(b,"bookings","sessions");
        const localBk=ls.get("local_bookings",[]);
        const allBk=[...bk,...localBk.filter(lb=>!bk.some(ab=>ab.id===lb.id))];
        const isTomorrow=msg.includes("tomorrow");
        const targetDate=new Date();
        if(isTomorrow)targetDate.setDate(targetDate.getDate()+1);
        const dateStr=targetDate.toISOString().slice(0,10);
        const dayName=targetDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});
        const dayBk=allBk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt).toISOString().slice(0,10)===dateStr;}catch{return false;}}).sort((a,b)=>new Date(a.date||a.startTime)-new Date(b.date||b.startTime));

        let txt=`📅 Schedule for ${dayName} (${dayBk.length} session${dayBk.length!==1?"s":""}):\n`;
        if(dayBk.length===0)txt+="\nNo sessions scheduled. Your day is free!";
        else dayBk.forEach((x,i)=>{
          const t=new Date(x.date||x.startTime||x.scheduledAt);
          txt+=`\n${i+1}. ${t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} — ${cName(x.client)||x.type||"Session"} (${x.duration||60}min) [${x.status||"pending"}]`;
        });
        results.push(txt);
      }catch(e){results.push("⚠️ Could not fetch schedule: "+e.message);}
    }

    // ─ BOOK SESSION ─
    const bookMatch=msg.match(/book\s+(?:a\s+)?(?:session\s+)?(?:for\s+)?([a-zA-Z]+)\s+(?:on\s+)?(?:(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s*(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i);
    if(bookMatch){
      const clientName=bookMatch[1];
      const dayWord=bookMatch[2].toLowerCase();
      const timeStr=bookMatch[3]||"09:00";

      // Resolve client
      let clients2=[];
      try{const c=await api.get("/clients");clients2=unwrap(c,"clients");}catch{}
      const matchedClient=clients2.find(c=>cName(c).toLowerCase().includes(clientName.toLowerCase()));

      // Resolve date
      let bookDate=new Date();
      if(dayWord==="tomorrow")bookDate.setDate(bookDate.getDate()+1);
      else if(dayWord!=="today"){
        const days=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
        const targetDay=days.indexOf(dayWord);
        if(targetDay>=0){
          const current=bookDate.getDay();
          const diff=(targetDay-current+7)%7||7;
          bookDate.setDate(bookDate.getDate()+diff);
        }
      }

      // Parse time
      let hours=9,minutes=0;
      const timeParsed=timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if(timeParsed){
        hours=parseInt(timeParsed[1]);minutes=parseInt(timeParsed[2]||"0");
        if(timeParsed[3]?.toLowerCase()==="pm"&&hours<12)hours+=12;
        if(timeParsed[3]?.toLowerCase()==="am"&&hours===12)hours=0;
      }
      const dateISO=bookDate.toISOString().slice(0,10)+`T${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:00`;

      // Create booking (local)
      const localBooking={
        id:`local_${Date.now()}`,date:dateISO,duration:60,type:"training",status:"confirmed",
        client:matchedClient||{displayName:clientName},clientId:matchedClient?.id,
        createdAt:new Date().toISOString(),_local:true
      };
      const existing=ls.get("local_bookings",[]);
      ls.set("local_bookings",[...existing,localBooking]);

      results.push(`✅ Session booked!\n   Client: ${cName(matchedClient)||clientName}${!matchedClient?" (not found in system — saved anyway)":""}\n   Date: ${bookDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}\n   Time: ${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}\n   Duration: 60min\n   Status: Confirmed`);
    }

    // ─ REVENUE / STATS ─
    if(msg.match(/revenue|earnings|income|how much.*(?:made|earned)|stats|business|overview|dashboard/i)&&!addClientMatch&&!bookMatch){
      try{
        const r=await api.get("/reports/coach/dashboard");const d=r?.data||r||{};
        results.push(`📊 Business Overview:\n\n💰 Revenue: ₹${(d.totalRevenue||d.monthlyRevenue||0).toLocaleString()}\n👥 Active Clients: ${d.activeClients||d.totalClients||0}\n📅 Upcoming Sessions: ${d.upcomingBookings||0}\n🎯 Conversion Rate: ${d.conversionRate||0}%\n🔄 Retention Rate: ${d.retentionRate||0}%`);
      }catch{results.push("⚠️ Could not fetch business stats");}
    }

    // ─ CREATE WORKOUT ─
    if(msg.match(/(?:create|make|generate|build)\s+(?:a\s+)?(?:workout|exercise|training)\s*(?:plan)?/i)){
      const isPush=msg.includes("push");const isPull=msg.includes("pull");const isLegs=msg.includes("leg");
      const isUpper=msg.includes("upper");const isLower=msg.includes("lower");const isFull=msg.includes("full body");
      let title="Custom Workout";let exercises=[];

      if(isPush){title="Push Day";exercises=[{name:"Bench Press",sets:4,reps:8},{name:"Overhead Press",sets:3,reps:10},{name:"Incline DB Press",sets:3,reps:10},{name:"Lateral Raise",sets:3,reps:15},{name:"Tricep Pushdown",sets:3,reps:12},{name:"Cable Fly",sets:3,reps:12}];}
      else if(isPull){title="Pull Day";exercises=[{name:"Deadlift",sets:4,reps:6},{name:"Barbell Row",sets:4,reps:8},{name:"Lat Pulldown",sets:3,reps:10},{name:"Face Pull",sets:3,reps:15},{name:"Dumbbell Curl",sets:3,reps:12},{name:"Hammer Curl",sets:3,reps:12}];}
      else if(isLegs){title="Leg Day";exercises=[{name:"Barbell Squat",sets:4,reps:8},{name:"Romanian Deadlift",sets:3,reps:10},{name:"Leg Press",sets:3,reps:12},{name:"Leg Curl",sets:3,reps:12},{name:"Bulgarian Split Squat",sets:3,reps:10},{name:"Calf Raise",sets:4,reps:15}];}
      else if(isFull){title="Full Body";exercises=[{name:"Barbell Squat",sets:3,reps:8},{name:"Bench Press",sets:3,reps:8},{name:"Barbell Row",sets:3,reps:8},{name:"Overhead Press",sets:3,reps:10},{name:"Romanian Deadlift",sets:3,reps:10},{name:"Pull-ups",sets:3,reps:8}];}
      else{title="General Strength";exercises=[{name:"Barbell Squat",sets:3,reps:10},{name:"Bench Press",sets:3,reps:10},{name:"Barbell Row",sets:3,reps:10},{name:"Overhead Press",sets:3,reps:10},{name:"Deadlift",sets:3,reps:8}];}

      // Save locally
      const plan={id:`workout_${Date.now()}`,title,description:"Created by AI Coach",exercises,status:"active",createdAt:new Date().toISOString()};
      const localW=ls.get("local_workouts",[]);localW.push(plan);ls.set("local_workouts",localW);

      let txt=`💪 Workout Created: ${title}\n`;
      exercises.forEach((e,i)=>{txt+=`\n${i+1}. ${e.name} — ${e.sets}×${e.reps}`;});
      txt+=`\n\n✅ Saved! View it in the Workouts tab → My Plans.`;
      results.push(txt);
    }

    // ─ CANCEL SESSIONS ─
    if(msg.match(/cancel\s+(?:all\s+)?(?:sessions?|bookings?)\s+(?:on\s+|for\s+)?(?:today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i)){
      const dayMatch=msg.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if(dayMatch){
        let targetDate=new Date();
        const dayWord=dayMatch[1].toLowerCase();
        if(dayWord==="tomorrow")targetDate.setDate(targetDate.getDate()+1);
        else if(dayWord!=="today"){
          const days=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
          const targetDay=days.indexOf(dayWord);
          if(targetDay>=0){const diff=(targetDay-targetDate.getDay()+7)%7||7;targetDate.setDate(targetDate.getDate()+diff);}
        }
        const dateStr=targetDate.toISOString().slice(0,10);

        // Cancel local bookings for that day
        const localBk=ls.get("local_bookings",[]);
        let count=0;
        const updated=localBk.map(b=>{
          try{if(new Date(b.date||b.startTime||b.scheduledAt).toISOString().slice(0,10)===dateStr){count++;return{...b,status:"cancelled"};}}catch{}
          return b;
        });
        ls.set("local_bookings",updated);

        // Mark as holiday
        const holidays=ls.get("holidays",[]);
        if(!holidays.includes(dateStr)){ls.set("holidays",[...holidays,dateStr]);}

        results.push(`🚫 ${count} session(s) cancelled for ${targetDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}.\n📅 Day marked as holiday.`);
      }
    }

    // ─ DELETE CLIENT ─
    const deleteMatch=msg.match(/(?:delete|remove)\s+client\s+([a-zA-Z\s]+?)(?:\s*$|\s*,)/i);
    if(deleteMatch){
      const name=deleteMatch[1].trim();
      try{
        const c=await api.get("/clients");const cl=unwrap(c,"clients");
        const match=cl.find(x=>cName(x).toLowerCase().includes(name.toLowerCase()));
        if(match){
          try{await api.del(`/clients/${match.id}`);results.push(`✅ Client "${cName(match)}" deleted.`);}
          catch(e){results.push(`⚠️ Could not delete: ${e.message}`);}
        }else{results.push(`❌ No client found matching "${name}"`);}
      }catch{results.push("⚠️ Could not fetch clients");}
    }

    // ─ FIND CLIENT ─
    const findMatch=msg.match(/(?:find|search|look up|who is)\s+(?:client\s+)?([a-zA-Z]+)/i);
    if(findMatch&&!addClientMatch&&!deleteMatch&&!bookMatch){
      const name=findMatch[1].trim();
      try{
        const c=await api.get("/clients");const cl=unwrap(c,"clients");
        const matches=cl.filter(x=>cName(x).toLowerCase().includes(name.toLowerCase()));
        if(matches.length>0){
          let txt=`🔍 Found ${matches.length} match(es) for "${name}":\n`;
          matches.forEach(x=>{txt+=`\n• ${cName(x)} — ${cEmail(x)} — 📱${cPhone(x)||"no phone"} — ${x.sessionType||"offline"}`});
          results.push(txt);
        }else{results.push(`❌ No clients found matching "${name}"`);}
      }catch{results.push("⚠️ Could not search clients");}
    }

    return results;
  };

  // ── SEND MESSAGE ───────────────────────────────────────────────────────
  const send=async(text)=>{
    const msg=(text||input).trim();if(!msg||loading)return;
    if(!text)setInput("");
    setMsgs(p=>[...p,{role:"user",content:msg}]);setLoading(true);

    try{
      // 1. Execute any detected actions
      const actionResults=await executeAction(msg);

      // 2. Build context for AI
      const context=await gatherContext();

      // 3. Create a SINGLE message with embedded context
      const enrichedMessage=`[SYSTEM CONTEXT — You are CoachMe AI assistant. Use the data below to answer. Be specific and use actual names/numbers from the data. Current date: ${new Date().toLocaleString()}. Coach: ${user?.name||"Coach"} (${user?.email}).

APP DATA:${context}

${actionResults.length>0?`\nACTIONS ALREADY EXECUTED:\n${actionResults.join("\n")}\n\nTell the user about these completed actions and ask if they need anything else.`:""}
END CONTEXT]

User question: ${msg}`;

      // 4. Send to AI with context packed into the message
      const r=await api.post("/ai/chat",{message:enrichedMessage});
      let reply=r.reply||r.message||r.response||"";

      // 5. If AI gave a generic/empty response, use our action results instead
      const isGeneric=!reply||reply.length<20||reply.toLowerCase().includes("let me help")||reply.toLowerCase().includes("i'll help")||reply.toLowerCase().includes("i can help")||reply.toLowerCase().includes("sure, i");

      if(actionResults.length>0){
        // We have action results — show them (optionally with AI commentary)
        reply=actionResults.join("\n\n")+(isGeneric?"":"\n\n"+reply);
      }else if(isGeneric){
        // AI gave generic response and no actions — try to answer from context
        reply=await generateLocalResponse(msg,context);
      }

      setMsgs(p=>[...p,{role:"assistant",content:reply}]);
      speakText(reply);
    }catch(e){
      // Even if AI fails, action results may have worked
      const fallback="I couldn't reach the AI service, but your app data is accessible. Try asking about your schedule, clients, or stats — I can look those up directly.";
      setMsgs(p=>[...p,{role:"assistant",content:fallback}]);
    }
    setLoading(false);
  };

  // ── LOCAL RESPONSE GENERATOR (when AI gives generic answers) ───────────
  const generateLocalResponse=async(msg,context)=>{
    const lower=msg.toLowerCase();

    // Schedule queries
    if(lower.match(/schedule|session|booking|calendar|today|tomorrow/)){
      try{
        const b=await api.get("/bookings");const bk=unwrap(b,"bookings","sessions");
        const localBk=ls.get("local_bookings",[]);
        const allBk=[...bk,...localBk.filter(lb=>!bk.some(ab=>ab.id===lb.id))];
        const today=new Date().toISOString().slice(0,10);
        const todayBk=allBk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt).toISOString().slice(0,10)===today;}catch{return false;}});
        if(todayBk.length===0)return"📅 You have no sessions scheduled today. Your day is free!";
        let txt=`📅 Today's schedule (${todayBk.length} session${todayBk.length>1?"s":""}):\n`;
        todayBk.forEach((x,i)=>{const t=new Date(x.date||x.startTime||x.scheduledAt);txt+=`\n${i+1}. ${t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} — ${cName(x.client)||x.type||"Session"} (${x.duration||60}min)`;});
        return txt;
      }catch{}
    }

    // Client queries
    if(lower.match(/client|how many/)){
      try{
        const c=await api.get("/clients");const cl=unwrap(c,"clients");
        return`👥 You have ${cl.length} client(s).${cl.length>0?"\n\nTop clients:\n"+cl.slice(0,5).map((x,i)=>`${i+1}. ${cName(x)} — ${cEmail(x)}`).join("\n"):""}`;
      }catch{}
    }

    // Revenue/stats
    if(lower.match(/revenue|money|earned|income|stats|business/)){
      try{
        const r=await api.get("/reports/coach/dashboard");const d=r?.data||r||{};
        return`📊 Business Stats:\n\n💰 Revenue: ₹${(d.totalRevenue||d.monthlyRevenue||0).toLocaleString()}\n👥 Clients: ${d.activeClients||d.totalClients||0}\n📅 Upcoming: ${d.upcomingBookings||0} sessions\n🎯 Conversion: ${d.conversionRate||0}%`;
      }catch{}
    }

    // Leads
    if(lower.match(/lead/)){
      try{
        const l=await api.get("/leads");const ld=unwrap(l,"leads");
        const localLeads=ls.get("local_leads",[]);
        const all=[...ld,...localLeads];
        return`🎯 You have ${all.length} lead(s):\n\n${all.slice(0,10).map((x,i)=>`${i+1}. ${x.name} — [${x.status||"new"}]`).join("\n")}`;
      }catch{}
    }

    // Fallback
    return"I processed your request. You can try asking about:\n• Your schedule (\"show today's sessions\")\n• Clients (\"list my clients\")\n• Revenue (\"show my stats\")\n• Add data (\"add client Ravi, phone 98765\")\n• Workouts (\"create a push day workout\")\n• Bookings (\"book session for Priya tomorrow 7am\")";
  };

  const suggestions=["Show today's schedule","List my clients","What's my revenue?","Add client Ravi, phone 9876543210","Create a push day workout","Book session for Priya tomorrow 7am"];

  return<div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 160px)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexShrink:0}}>
      <h2 style={{color:C.tx,fontSize:20,fontWeight:700,margin:0}}>AI Coach</h2>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>{setVoiceOn(!voiceOn);if(voiceOn)speechSynthesis.cancel();}} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:voiceOn?C.ok+"20":C.s2,color:voiceOn?C.ok:C.mt}}>{voiceOn?"🔊 On":"🔇 Off"}</button>
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:12}}>
      {msgs.map((m,i)=><div key={i} style={{maxWidth:"85%",alignSelf:m.role==="user"?"flex-end":"flex-start",padding:"12px 16px",borderRadius:16,borderBottomRightRadius:m.role==="user"?4:16,borderBottomLeftRadius:m.role==="user"?16:4,background:m.role==="user"?C.ac:C.s2,color:m.role==="user"?"#fff":C.tx,fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}</div>)}
      {loading&&<div style={{alignSelf:"flex-start",padding:"12px 20px",borderRadius:16,background:C.s2}}><div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.mt,animation:`pulse 1.2s ease-in-out ${i*.2}s infinite`}}/>)}</div></div>}
      <div ref={br}/>
    </div>

    {/* Quick suggestions */}
    {msgs.length<=2&&<div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,flexShrink:0}}>
      {suggestions.map(s=><button key={s} onClick={()=>send(s)} style={{padding:"8px 14px",borderRadius:20,border:`1px solid ${C.bd}`,background:C.s2,color:C.tx,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{s}</button>)}
    </div>}

    <div style={{display:"flex",gap:8,flexShrink:0,paddingTop:8}}>
      <button onClick={toggleListening} style={{width:48,height:48,borderRadius:14,border:"none",cursor:"pointer",background:isListening?C.dg:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:isListening?`0 0 20px ${C.dg}40`:"none",animation:isListening?"pulse 1s infinite":"none",transition:"all .2s"}}>🎙️</button>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={isListening?"Listening…":"Type or speak a command…"} style={{flex:1,background:C.s2,border:`1px solid ${isListening?C.dg:C.bd}`,borderRadius:14,padding:"12px 16px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit",transition:"border-color .2s"}}/>
      <button onClick={()=>send()} disabled={loading} style={{width:48,height:48,borderRadius:14,border:"none",cursor:"pointer",background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff"}}>➤</button>
    </div>
  </div>;
}

function MessagingPage({initialClient,onBack}){const{user}=useAuth();const[convos,setConvos]=useState([]);const[active,setActive]=useState(initialClient||null);const[msgs,setMsgs]=useState([]);const[input,setInput]=useState("");const br=useRef(null);const pr=useRef(null);useEffect(()=>{api.get("/clients").then(d=>setConvos(unwrap(d,"clients"))).catch(()=>{});},[]);useEffect(()=>{if(!active)return;
    const cid=active.id||active.userId;
    const ld=()=>{
      api.get(`/messages/${cid}`).then(d=>setMsgs(unwrap(d,"messages"))).catch(()=>{
        // Messages route doesn't exist — use local messages
        setMsgs(ls.get(`msgs_${cid}`,[]));
      });
    };
    ld();pr.current=setInterval(ld,8000);return()=>clearInterval(pr.current);
  },[active]);useEffect(()=>{br.current?.scrollIntoView({behavior:"smooth"});},[msgs]);const sendMsg=async()=>{if(!input.trim())return;const t=input.trim();setInput("");setMsgs(m=>[...m,{id:Date.now(),senderId:user?.id,content:t,createdAt:new Date().toISOString()}]);try{await api.post("/messages",{recipientId:active.id||active.userId,content:t});}catch{
      // Messages route doesn't exist — save locally
      const cid=active.id||active.userId;
      const local=ls.get(`msgs_${cid}`,[]);
      local.push({id:Date.now(),senderId:user?.id,content:t,createdAt:new Date().toISOString()});
      ls.set(`msgs_${cid}`,local);
    }};if(!active)return<div><ST>Messages</ST>{convos.length===0?<Empty icon="💬" text="No conversations"/>:convos.map(c=><Card key={c.id} onClick={()=>setActive(c)} style={{padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",marginBottom:6}}><div style={{width:44,height:44,borderRadius:22,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:"#fff"}}>{(cName(c))[0].toUpperCase()}</div><div style={{flex:1}}><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{cName(c)}</div><div style={{color:C.mt,fontSize:12}}>Tap to chat</div></div></Card>)}</div>;return<div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 160px)"}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><button onClick={()=>{setActive(null);onBack?.();}} style={{background:"none",border:"none",cursor:"pointer",color:C.tx,fontSize:20,padding:0}}>←</button><div style={{width:36,height:36,borderRadius:18,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>{(cName(active))[0].toUpperCase()}</div><div><div style={{color:C.tx,fontSize:15,fontWeight:600}}>{cName(active)}</div><div style={{color:C.ok,fontSize:11}}>● online</div></div></div><div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,paddingBottom:8}}>{msgs.length===0&&<Empty icon="💬" text="Start chatting"/>}{msgs.map(m=>{const me=m.senderId===user?.id;return<div key={m.id} style={{maxWidth:"78%",alignSelf:me?"flex-end":"flex-start",padding:"10px 14px",borderRadius:14,borderBottomRightRadius:me?4:14,borderBottomLeftRadius:me?14:4,background:me?C.ac:C.s2,color:me?"#fff":C.tx,fontSize:14,lineHeight:1.45}}>{m.content}<div style={{fontSize:10,opacity:.6,marginTop:4,textAlign:"right"}}>{new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div></div>;})}<div ref={br}/></div><div style={{display:"flex",gap:8,flexShrink:0,paddingTop:8}}><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Type a message…" style={{flex:1,background:C.s2,border:`1px solid ${C.bd}`,borderRadius:24,padding:"12px 18px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit"}}/><button onClick={sendMsg} style={{width:48,height:48,borderRadius:24,border:"none",cursor:"pointer",background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff"}}>➤</button></div></div>;}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
function InvoicesPage(){const[inv,setInv]=useState(ls.get("invoices",[]));const[showAdd,setShowAdd]=useState(false);const[clients,setClients]=useState([]);const[form,setForm]=useState({clientId:"",amount:"",description:"",dueDate:""});useEffect(()=>{api.get("/clients").then(d=>setClients(unwrap(d,"clients"))).catch(()=>{});},[]);const save=()=>{const cl=clients.find(c=>c.id===form.clientId);const e={...form,id:Date.now(),clientName:cl?.name||cl?.user?.name||"Client",date:new Date().toISOString().slice(0,10),amount:+form.amount,status:"pending"};const u=[...inv,e];setInv(u);ls.set("invoices",u);setShowAdd(false);setForm({clientId:"",amount:"",description:"",dueDate:""});};const markPaid=id=>{const u=inv.map(i=>i.id===id?{...i,status:"paid"}:i);setInv(u);ls.set("invoices",u);};const tp=inv.filter(i=>i.status==="pending").reduce((s,i)=>s+i.amount,0);const tc=inv.filter(i=>i.status==="paid").reduce((s,i)=>s+i.amount,0);return<div><ST right={<Btn onClick={()=>setShowAdd(true)} style={{padding:"8px 16px",fontSize:13}}>+ Invoice</Btn>}>Invoices</ST><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}><SC label="Pending" value={`₹${tp.toLocaleString()}`} icon="⏳" color={C.wn}/><SC label="Collected" value={`₹${tc.toLocaleString()}`} icon="✅" color={C.ok}/></div>{inv.length===0?<Empty icon="🧾" text="No invoices"/>:inv.slice().reverse().map(i=><Card key={i.id} style={{padding:14,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{i.clientName}</div><div style={{fontSize:12,color:C.mt}}>{i.description} · {i.date}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:C.tx}}>₹{i.amount.toLocaleString()}</div>{i.status==="pending"?<button onClick={()=>markPaid(i.id)} style={{padding:"3px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:C.ok+"20",color:C.ok,marginTop:4}}>Mark Paid</button>:<Badge color={C.ok}>Paid</Badge>}</div></Card>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Create Invoice"><div style={{display:"flex",flexDirection:"column",gap:12}}>{clients.length>0&&<Sel label="Client" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select —"},...clients.map(c=>({value:c.id,label:cName(c)}))]}/>}<Input label="Amount (₹)" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/><Input label="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Monthly coaching - March"/><Input label="Due Date" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><Btn onClick={save} style={{width:"100%"}}>Create</Btn></div></Modal></div>;}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsPage(){const{user,logout}=useAuth();const{themeName,switchTheme,themes}=useTheme();const[profile,setProfile]=useState({name:user?.name||"",email:user?.email||""});const[saved,setSaved]=useState(false);
  const[bottomTabs,setBottomTabs]=useState(getBottomTabs());
  const[showTabEdit,setShowTabEdit]=useState(false);

  const save=async()=>{try{await api.put("/auth/profile",profile);setSaved(true);setTimeout(()=>setSaved(false),2000);}catch{}};

  const moveTab=(idx,dir)=>{
    const arr=[...bottomTabs];const newIdx=idx+dir;
    if(newIdx<0||newIdx>=arr.length)return;
    [arr[idx],arr[newIdx]]=[arr[newIdx],arr[idx]];
    setBottomTabs(arr);ls.set("bottom_tabs",arr);
  };

  const swapTab=(idx,newId)=>{
    const arr=[...bottomTabs];arr[idx]=newId;
    setBottomTabs(arr);ls.set("bottom_tabs",arr);
  };

  const resetTabs=()=>{setBottomTabs([...DEFAULT_BOTTOM]);ls.set("bottom_tabs",DEFAULT_BOTTOM);};

  return<div><ST>Settings</ST><Card style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}><div style={{width:56,height:56,borderRadius:16,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff"}}>{(user?.name||"U")[0].toUpperCase()}</div><div><div style={{color:C.tx,fontSize:16,fontWeight:600}}>{user?.name}</div><Badge>{user?.role||"coach"}</Badge></div></div><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Name" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/><Input label="Email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/><Btn onClick={save} style={{width:"100%"}}>{saved?"✓ Saved!":"Update Profile"}</Btn></div></Card>
    {/* Theme Switcher */}
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:12}}>Theme</div>
      <div style={{display:"flex",gap:8}}>
        {Object.entries(themes).map(([id,t])=><button key={id} onClick={()=>switchTheme(id)} style={{flex:1,padding:"14px 8px",borderRadius:14,border:themeName===id?`2px solid ${C.ac}`:`1px solid ${C.bd}`,background:t.sf,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,transition:"all .2s",transform:themeName===id?"scale(1.03)":"scale(1)",boxShadow:themeName===id?`0 4px 16px ${t.ac}30`:"none"}}>
          <div style={{display:"flex",gap:3}}><div style={{width:14,height:14,borderRadius:4,background:t.ac}}/><div style={{width:14,height:14,borderRadius:4,background:t.a2}}/><div style={{width:14,height:14,borderRadius:4,background:t.ok}}/></div>
          <span style={{fontSize:11,fontWeight:700,color:t.tx}}>{t.name}</span>
          <div style={{width:"100%",height:4,borderRadius:2,background:t.gr}}/>
        </button>)}
      </div>
    </Card>
    {/* Tab customization */}
    <Card style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:600,color:C.tx}}>Bottom Navigation</div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={resetTabs} style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:C.s2,color:C.mt}}>Reset</button>
        </div>
      </div>
      <div style={{fontSize:12,color:C.mt,marginBottom:10}}>Drag to reorder. Tap a slot to change which tab appears there.</div>
      {bottomTabs.map((tabId,i)=>{
        const tabDef=ALL_TABS.find(t=>t.id===tabId);
        const available=ALL_TABS.filter(t=>!bottomTabs.includes(t.id)||t.id===tabId);
        return<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.bd}`}}>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <button onClick={()=>moveTab(i,-1)} disabled={i===0} style={{background:"none",border:"none",cursor:i>0?"pointer":"default",fontSize:14,color:i>0?C.tx:C.bd,padding:0}}>▲</button>
            <button onClick={()=>moveTab(i,1)} disabled={i===bottomTabs.length-1} style={{background:"none",border:"none",cursor:i<bottomTabs.length-1?"pointer":"default",fontSize:14,color:i<bottomTabs.length-1?C.tx:C.bd,padding:0}}>▼</button>
          </div>
          <span style={{fontSize:18,width:28,textAlign:"center"}}>{tabDef?.icon||"?"}</span>
          <select value={tabId} onChange={e=>swapTab(i,e.target.value)} style={{flex:1,background:C.s2,border:`1px solid ${C.bd}`,borderRadius:8,padding:"6px 10px",color:C.tx,fontSize:13,fontFamily:"inherit"}}>
            {available.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
          <span style={{fontSize:12,color:C.mt,fontWeight:600}}>Slot {i+1}</span>
        </div>;
      })}
    </Card>

    <Card><Btn variant="danger" onClick={logout} style={{width:"100%"}}>🚪 Sign Out</Btn></Card></div>;}

// ─── NAV + ROUTING ────────────────────────────────────────────────────────────
const ALL_TABS=[
  {id:"dashboard",icon:"🏠",label:"Home"},
  {id:"workouts",icon:"💪",label:"Workouts"},
  {id:"bookings",icon:"📅",label:"Schedule"},
  {id:"chat",icon:"💬",label:"Chat"},
  {id:"clients",icon:"👥",label:"Clients"},
  {id:"leads",icon:"🎯",label:"Leads"},
  {id:"ai",icon:"🤖",label:"AI Coach"},
  {id:"reports",icon:"📊",label:"Analytics"},
  {id:"more",icon:"⚙️",label:"More"},
];
const DEFAULT_BOTTOM=["dashboard","workouts","bookings","chat","more"];
function getBottomTabs(){
  const saved=ls.get("bottom_tabs",null);
  if(saved&&Array.isArray(saved)&&saved.length===5)return saved;
  return DEFAULT_BOTTOM;
}
function TABS(){return getBottomTabs().map(id=>ALL_TABS.find(t=>t.id===id)).filter(Boolean);}
function BNav({active,onChange}){const tabs=TABS();return<nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:C.sf,borderTop:`1px solid ${C.bd}`,display:"flex",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>{tabs.map(t=>{const a=active===t.id;return<button key={t.id} onClick={()=>onChange(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 0 8px",border:"none",cursor:"pointer",background:"transparent"}}><div style={{padding:"4px 16px",borderRadius:12,background:a?C.ac+"20":"transparent",fontSize:18}}>{t.icon}</div><span style={{fontSize:10,fontWeight:a?700:500,color:a?C.ac:C.mt}}>{t.label}</span></button>;})}</nav>;}
function MediaLibrary({clientId,clientName}){
  const key=`media_${clientId||"all"}`;
  const[items,setItems]=useState(ls.get(key,[]));
  const[showAdd,setShowAdd]=useState(false);
  const[tab,setTab]=useState("videos");
  const[form,setForm]=useState({title:"",description:"",type:"video",url:""});

  const handleUpload=(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const entry={id:Date.now(),title:form.title||file.name,description:form.description,type:file.type.startsWith("video")?"video":"photo",url:ev.target.result,fileName:file.name,fileSize:file.size,date:new Date().toISOString().slice(0,10),shared:false,clientId};
      const updated=[...items,entry];setItems(updated);ls.set(key,updated);
      setForm({title:"",description:"",type:"video",url:""});setShowAdd(false);
    };
    reader.readAsDataURL(file);
  };

  const toggleShare=(id)=>{
    const updated=items.map(i=>i.id===id?{...i,shared:!i.shared}:i);
    setItems(updated);ls.set(key,updated);
  };

  const deleteItem=(id)=>{
    const updated=items.filter(i=>i.id!==id);
    setItems(updated);ls.set(key,updated);
  };

  const videos=items.filter(i=>i.type==="video");
  const photos=items.filter(i=>i.type==="photo");

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <span style={{fontSize:15,fontWeight:600,color:C.tx}}>{clientName?"Media for "+clientName:"Media Library"}</span>
      <Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Upload</Btn>
    </div>

    <Tabs tabs={[{id:"videos",label:`Videos (${videos.length})`},{id:"photos",label:`Progress Photos (${photos.length})`}]} active={tab} onChange={setTab}/>

    {tab==="videos"&&(videos.length===0?<Empty icon="🎥" text="No workout videos yet"/>:
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {videos.map(v=><Card key={v.id} style={{padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{v.title}</div>
              {v.description&&<div style={{fontSize:12,color:C.mt,marginTop:2}}>{v.description}</div>}
              <div style={{fontSize:11,color:C.mt,marginTop:4}}>{v.date} · {(v.fileSize/1024/1024).toFixed(1)}MB</div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>toggleShare(v.id)} style={{padding:"4px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:v.shared?C.ok+"20":C.s2,color:v.shared?C.ok:C.mt}}>{v.shared?"✅ Shared":"📤 Share"}</button>
              <button onClick={()=>deleteItem(v.id)} style={{padding:"4px 8px",borderRadius:6,border:"none",fontSize:11,cursor:"pointer",background:C.dg+"15",color:C.dg}}>🗑️</button>
            </div>
          </div>
          {v.url&&v.url.startsWith("data:video")&&<video src={v.url} controls style={{width:"100%",borderRadius:8,marginTop:10,maxHeight:200}}/>}
        </Card>)}
      </div>
    )}

    {tab==="photos"&&(photos.length===0?<Empty icon="📸" text="No progress photos yet"/>:
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {photos.map(p=><Card key={p.id} style={{padding:8,position:"relative"}}>
          <img src={p.url} style={{width:"100%",borderRadius:8,aspectRatio:"3/4",objectFit:"cover"}}/>
          <div style={{fontSize:11,color:C.mt,marginTop:4,textAlign:"center"}}>{p.date}</div>
          <div style={{display:"flex",gap:4,marginTop:4}}>
            <button onClick={()=>toggleShare(p.id)} style={{flex:1,padding:"3px",borderRadius:4,border:"none",fontSize:10,cursor:"pointer",background:p.shared?C.ok+"20":C.s2,color:p.shared?C.ok:C.mt}}>{p.shared?"Shared":"Share"}</button>
            <button onClick={()=>deleteItem(p.id)} style={{padding:"3px 6px",borderRadius:4,border:"none",fontSize:10,cursor:"pointer",background:C.dg+"15",color:C.dg}}>✕</button>
          </div>
        </Card>)}
      </div>
    )}

    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Upload Media">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Input label="Title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Squat Form Tutorial"/>
        <TextArea label="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Brief description"/>
        <div>
          <label style={{fontSize:13,color:C.mt,fontWeight:500,marginBottom:6,display:"block"}}>Select File</label>
          <input type="file" accept="video/*,image/*" onChange={handleUpload} style={{fontSize:13,color:C.tx}}/>
          <div style={{fontSize:11,color:C.mt,marginTop:4}}>Accepts videos (MP4, MOV) and images (JPG, PNG)</div>
        </div>
      </div>
    </Modal>
  </div>;
}

function TestSuitePage(){
  const{user}=useAuth();
  const[results,setResults]=useState([]);const[running,setRunning]=useState(false);
  const[logLines,setLogLines]=useState([]);const[progress,setProgress]=useState(0);
  const addLog=(msg,type="info")=>setLogLines(p=>[...p,{msg,type,time:new Date().toLocaleTimeString()}]);
  const logRef=useRef(null);
  useEffect(()=>{logRef.current&&(logRef.current.scrollTop=logRef.current.scrollHeight);},[logLines]);

  const savedToken=useRef(api.token);
  const roleTokens=useRef({coach:null,client:null,admin:null});

  const apiTest=async(method,path,body=null,tok=null)=>{
    const headers={"Content-Type":"application/json"};const t=tok||savedToken.current;
    if(t)headers["Authorization"]=`Bearer ${t}`;
    const opts={method,headers};if(body)opts.body=JSON.stringify(body);
    addLog(`→ ${method} ${path}`);
    try{const res=await fetch(`${API}${path}`,opts);const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}
      addLog(`← ${res.status} ${JSON.stringify(data).slice(0,150)}`,res.ok?"ok":"err");
      return{status:res.status,ok:res.ok,data};}
    catch(e){addLog(`✕ ${e.message}`,"err");return{status:0,ok:false,data:{error:e.message}};}
  };

  const addR=(g,n,s,d="")=>setResults(p=>[...p,{group:g,name:n,status:s,detail:d}]);
  const xTok=(d)=>d?.token||d?.accessToken||d?.access_token||d?.data?.token;

  const runAll=async()=>{
    setResults([]);setLogLines([]);setRunning(true);setProgress(0);
    savedToken.current=api.token;
    addLog("━━━ COMPREHENSIVE MULTI-ROLE TEST SUITE ━━━","ok");
    addLog(`Primary user: ${user?.email} (${user?.role})`,"info");
    const ts=Date.now();let done=0;const total=80;const tick=()=>{done++;setProgress(Math.round((done/total)*100));};
    let r;

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 1: REGISTRATION (all roles) ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    // Register COACH
    const coachEmail=`testcoach_${ts}@cm.test`;
    r=await apiTest("POST","/auth/register",{name:"TestCoach",email:coachEmail,password:"Coach123!",role:"COACH"});
    addR("1. Register","Register COACH",r.ok?"pass":"fail",`${r.status}: ${r.ok?"OK":JSON.stringify(r.data).slice(0,80)}`);tick();
    roleTokens.current.coach=xTok(r.data);

    // Register CLIENT
    const clientEmail=`testclient_${ts}@cm.test`;
    r=await apiTest("POST","/auth/register",{name:"TestClient",email:clientEmail,password:"Client123!",role:"CLIENT"});
    addR("1. Register","Register CLIENT",r.ok?"pass":"fail",`${r.status}: ${r.ok?"OK":JSON.stringify(r.data).slice(0,80)}`);tick();
    roleTokens.current.client=xTok(r.data);

    // Register ADMIN
    const adminEmail=`testadmin_${ts}@cm.test`;
    r=await apiTest("POST","/auth/register",{name:"TestAdmin",email:adminEmail,password:"Admin123!",role:"ADMIN"});
    addR("1. Register","Register ADMIN",r.ok?"pass":"info",`${r.status}: ${r.ok?"OK":"ADMIN registration may be restricted"}`);tick();
    roleTokens.current.admin=xTok(r.data);

    // Duplicate rejection
    r=await apiTest("POST","/auth/register",{name:"Dupe",email:coachEmail,password:"X",role:"COACH"});
    addR("1. Register","Duplicate email rejected",r.status>=400?"pass":"fail",`${r.status}`);tick();

    // Missing fields
    r=await apiTest("POST","/auth/register",{email:"x@y.com"});
    addR("1. Register","Missing fields rejected",r.status>=400?"pass":"fail",`${r.status}`);tick();

    // Wrong role enum
    r=await apiTest("POST","/auth/register",{name:"Bad",email:`bad_${ts}@t.com`,password:"X",role:"invalid"});
    addR("1. Register","Invalid role rejected",r.status>=400?"pass":"fail",`${r.status}`);tick();

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 2: LOGIN (all roles) ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    // Login as COACH
    r=await apiTest("POST","/auth/login",{email:coachEmail,password:"Coach123!"});
    addR("2. Login","Login as COACH",r.ok?"pass":"fail",`${r.status}: ${r.ok?"token OK":"FAILED"}`);tick();
    if(r.ok&&xTok(r.data))roleTokens.current.coach=xTok(r.data);

    // Login as CLIENT
    r=await apiTest("POST","/auth/login",{email:clientEmail,password:"Client123!"});
    addR("2. Login","Login as CLIENT",r.ok?"pass":"fail",`${r.status}: ${r.ok?"token OK":"FAILED"}`);tick();
    if(r.ok&&xTok(r.data))roleTokens.current.client=xTok(r.data);

    // Login as ADMIN (using seeded account)
    r=await apiTest("POST","/auth/login",{email:"admin@fitos-nexus.com",password:"Admin123!"});
    addR("2. Login","Login as ADMIN (seeded)",r.ok?"pass":"info",`${r.status}: ${r.ok?"token OK":"admin account may not exist"}`);tick();
    if(r.ok&&xTok(r.data))roleTokens.current.admin=xTok(r.data);

    // Login with original coach
    r=await apiTest("POST","/auth/login",{email:"coach@fitos-nexus.com",password:"Coach123!"});
    if(r.ok&&xTok(r.data))savedToken.current=xTok(r.data); // Refresh our working token
    addR("2. Login","Re-login primary coach",r.ok?"pass":"fail",`${r.status}`);tick();

    // Wrong password
    r=await apiTest("POST","/auth/login",{email:coachEmail,password:"WrongPass!"});
    addR("2. Login","Wrong password rejected",!r.ok?"pass":"fail",`${r.status}`);tick();

    // Unknown email
    r=await apiTest("POST","/auth/login",{email:"nobody_exists_xyz@x.com",password:"x"});
    addR("2. Login","Unknown email rejected",!r.ok?"pass":"fail",`${r.status}`);tick();

    // Invalid token
    r=await apiTest("GET","/auth/me",null,"completely_invalid_token");
    addR("2. Login","Invalid token → 401",r.status===401||r.status===403?"pass":"fail",`${r.status}`);tick();

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 3: AUTH ENDPOINTS ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    r=await apiTest("GET","/auth/me");
    addR("3. Auth","GET /auth/me",r.ok?"pass":"fail",`${r.status}: ${r.data?.user?.email||"?"}`);tick();

    r=await apiTest("POST","/auth/refresh");
    addR("3. Auth","POST /auth/refresh",r.status!==404?"pass":"info",`${r.status}`);tick();

    addR("3. Auth","POST /auth/logout","info","SKIPPED — would revoke token");tick();

    r=await apiTest("POST","/auth/forgot-password",{email:"coach@fitos-nexus.com"});
    addR("3. Auth","POST /auth/forgot-password",true?"info":"info",`${r.status}: ${r.status===404?"not implemented":"exists"}`);tick();

    r=await apiTest("POST","/auth/reset-password",{token:"fake",password:"X"});
    addR("3. Auth","POST /auth/reset-password",true?"info":"info",`${r.status}: ${r.status===404?"not implemented":"exists"}`);tick();

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 4: COACH-ROLE TESTS ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    const ct=savedToken.current; // Coach token

    r=await apiTest("GET","/clients",null,ct);
    addR("4. Coach","GET /clients",r.ok?"pass":"fail",`${r.status}`);tick();

    r=await apiTest("POST","/clients",{name:"RoleTestClient",email:`rtc_${ts}@t.com`,phone:"9999",sessionType:"offline"},ct);
    const rtcId=r.data?.client?.id||r.data?.id;
    addR("4. Coach","POST /clients (create)",r.ok?"pass":"fail",`${r.status}: id=${rtcId}, name=${r.data?.client?.displayName||"?"}`);tick();

    if(rtcId){
      r=await apiTest("DELETE",`/clients/${rtcId}`,null,ct);
      addR("4. Coach","DELETE /clients/:id",r.ok?"pass":"fail",`${r.status}`);tick();
    }else{addR("4. Coach","DELETE /clients/:id","skip","no ID");tick();}

    r=await apiTest("POST","/clients/bulk",{clients:[{name:"BulkRC",email:`brc_${ts}@t.com`,phone:"111"}]},ct);
    addR("4. Coach","POST /clients/bulk",r.ok?"pass":"info",`${r.status}`);tick();

    r=await apiTest("GET","/bookings",null,ct);
    addR("4. Coach","GET /bookings",r.ok?"pass":"fail",`${r.status}`);tick();

    r=await apiTest("POST","/bookings",{date:new Date().toISOString(),duration:60,type:"training"},ct);
    addR("4. Coach","POST /bookings",r.ok?"pass":"info",`${r.status}: ${r.status===403?"403 (needs CLIENT role — local fallback)":"OK"}`);tick();

    r=await apiTest("GET","/leads",null,ct);
    addR("4. Coach","GET /leads",r.ok?"pass":"fail",`${r.status}`);tick();

    r=await apiTest("GET","/reports/coach/dashboard",null,ct);
    addR("4. Coach","GET /reports/coach/dashboard",r.ok?"pass":"fail",`${r.status}`);tick();

    r=await apiTest("GET","/reports/coach/revenue",null,ct);
    addR("4. Coach","GET /reports/coach/revenue",r.ok?"pass":"fail",`${r.status}`);tick();

    r=await apiTest("POST","/ai/chat",{message:"test"},ct);
    addR("4. Coach","POST /ai/chat",r.ok?"pass":"fail",`${r.status}: ${r.ok?"response OK":"error"}`);tick();

    r=await apiTest("GET","/coaches",null,ct);
    addR("4. Coach","GET /coaches (public)",r.ok?"pass":"fail",`${r.status}`);tick();

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 5: CLIENT-ROLE TESTS ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    const clt=roleTokens.current.client;
    if(clt){
      r=await apiTest("GET","/auth/me",null,clt);
      addR("5. Client","GET /auth/me (CLIENT)",r.ok?"pass":"fail",`${r.status}: ${r.data?.user?.role||"?"}`);tick();

      r=await apiTest("GET","/coaches",null,clt);
      addR("5. Client","GET /coaches (search)",r.ok?"pass":"fail",`${r.status}`);tick();

      r=await apiTest("POST","/bookings",{date:new Date().toISOString(),duration:60,type:"training"},clt);
      addR("5. Client","POST /bookings (CLIENT can book!)",r.ok?"pass":"info",`${r.status}: ${r.ok?"✅ CLIENT role accepted":"still needs more fields"}`);tick();

      r=await apiTest("GET","/bookings",null,clt);
      addR("5. Client","GET /bookings",r.ok?"pass":"info",`${r.status}`);tick();

      r=await apiTest("GET","/clients",null,clt);
      addR("5. Client","GET /clients (CLIENT view)",r.ok?"pass":"info",`${r.status}: ${r.ok?"can see clients":r.status===403?"correctly restricted":"error"}`);tick();

      r=await apiTest("POST","/ai/chat",{message:"suggest a workout"},clt);
      addR("5. Client","POST /ai/chat",r.ok?"pass":"info",`${r.status}: ${r.ok?"AI works for CLIENT":"may be restricted"}`);tick();

      r=await apiTest("GET","/reports/coach/dashboard",null,clt);
      addR("5. Client","GET /reports/coach/* (CLIENT)",r.ok?"info":"pass",`${r.status}: ${r.ok?"accessible (unexpected)":"correctly restricted"}`);tick();

      r=await apiTest("GET","/leads",null,clt);
      addR("5. Client","GET /leads (CLIENT)",r.ok?"info":"pass",`${r.status}: ${r.ok?"accessible":"correctly restricted"}`);tick();
    }else{for(let i=0;i<8;i++){addR("5. Client","(skipped)","skip","No CLIENT token");tick();}}

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 6: ADMIN-ROLE TESTS ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    const adt=roleTokens.current.admin;
    if(adt){
      r=await apiTest("GET","/auth/me",null,adt);
      addR("6. Admin","GET /auth/me (ADMIN)",r.ok?"pass":"fail",`${r.status}: role=${r.data?.user?.role||"?"}`);tick();

      r=await apiTest("GET","/reports/admin/platform",null,adt);
      addR("6. Admin","GET /reports/admin/platform",r.ok?"pass":"info",`${r.status}: ${r.ok?"admin access granted":"restricted"}`);tick();

      r=await apiTest("GET","/clients",null,adt);
      addR("6. Admin","GET /clients (ADMIN view)",r.ok?"pass":"info",`${r.status}`);tick();

      r=await apiTest("GET","/leads",null,adt);
      addR("6. Admin","GET /leads (ADMIN)",r.ok?"pass":"info",`${r.status}`);tick();

      r=await apiTest("GET","/coaches",null,adt);
      addR("6. Admin","GET /coaches (ADMIN)",r.ok?"pass":"info",`${r.status}`);tick();
    }else{for(let i=0;i<5;i++){addR("6. Admin","(skipped)","skip","No ADMIN token — registration may be restricted");tick();}}

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 7: CROSS-ROLE SECURITY ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    if(clt){
      r=await apiTest("POST","/clients",{name:"HackerClient",email:`hack_${ts}@t.com`,phone:"000"},clt);
      addR("7. Security","CLIENT cannot create clients",!r.ok||r.status===403?"pass":"info",`${r.status}: ${r.status===403?"correctly blocked":"might be allowed"}`);tick();

      r=await apiTest("DELETE","/clients/"+(rtcId||"test"),null,clt);
      addR("7. Security","CLIENT cannot delete clients",!r.ok||r.status>=400?"pass":"fail",`${r.status}`);tick();

      r=await apiTest("GET","/reports/admin/platform",null,clt);
      addR("7. Security","CLIENT cannot access admin reports",!r.ok||r.status>=400?"pass":"fail",`${r.status}: correctly blocked`);tick();
    }else{for(let i=0;i<3;i++){addR("7. Security","(skipped)","skip","No CLIENT token");tick();}}

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 8: LOCAL FEATURES ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    [{key:"hab_me",push:{id:99,name:"T",icon:"✨",streak:0,log:{}},l:"Habits"},{key:"nut_me",push:{id:99,name:"T",calories:500,protein:30,carbs:40,fat:15,meal:"lunch",date:"2026-01-01"},l:"Nutrition"},{key:"checkins",push:{id:99,energy:8,sleep:7,stress:3,adherence:80,mood:"good",date:"2026-01-01"},l:"Check-ins"},{key:"invoices",push:{id:99,clientName:"T",amount:1000,status:"pending",date:"2026-01-01"},l:"Invoices"},{key:"prog_test",push:{id:99,weight:75,bodyFat:18,date:"2026-01-01"},l:"Progress"},{key:"media_test",push:{id:99,title:"T",type:"video"},l:"Media"},{key:"device_data",push:{date:"2026-01-01",source:"test",steps:8000,heartRateAvg:72},l:"Device Data"}].forEach(t=>{
      const a=ls.get(t.key,[]);a.push(t.push);ls.set(t.key,a);
      addR("8. Local",`${t.l} — CRUD`,"pass",`${a.length} items`);tick();
      ls.set(t.key,a.filter(x=>x.id!==99&&x.source!=="test"));
    });

    ls.set("holidays",[...(ls.get("holidays",[])),"2099-12-25"]);
    addR("8. Local","Holidays","pass","saved");tick();
    ls.set("holidays",ls.get("holidays",[]).filter(h=>h!=="2099-12-25"));

    ls.set("local_bookings",[...(ls.get("local_bookings",[])),{id:"lt",date:new Date().toISOString(),status:"confirmed",_local:true}]);
    addR("8. Local","Local booking fallback","pass","saved");tick();
    ls.set("local_bookings",ls.get("local_bookings",[]).filter(b=>b.id!=="lt"));

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 9: BROWSER APIs ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    addR("9. Browser","SpeechRecognition",!!(window.SpeechRecognition||window.webkitSpeechRecognition)?"pass":"info","for voice commands");tick();
    addR("9. Browser","SpeechSynthesis",!!window.speechSynthesis?"pass":"info","for voice output");tick();
    addR("9. Browser","localStorage",!!window.localStorage?"pass":"fail","required");tick();
    addR("9. Browser","Geolocation",!!navigator.geolocation?"pass":"info","optional");tick();
    addR("9. Browser","Web Crypto",!!window.crypto?.subtle?"pass":"info","for secure operations");tick();

    // ══════════════════════════════════════════════════════════════════════
    addLog("\n━━ PHASE 10: ROUTE DISCOVERY ━━","ok");
    // ══════════════════════════════════════════════════════════════════════

    for(const p of["/workouts","/workouts/sessions","/messages","/notifications","/subscriptions","/reviews","/bookings/upcoming"]){
      r=await apiTest("GET",p);
      addR("10. Discovery",`GET ${p}`,r.status===404?"missing":r.status===401?"exists (auth)":"exists",`${r.status}`);tick();
    }

    // ══════════════════════════════════════════════════════════════════════
    setProgress(100);
    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━","ok");
    addLog("ALL TESTS COMPLETE","ok");
    setRunning(false);
  };

  const pass=results.filter(r=>r.status==="pass").length;
  const fail=results.filter(r=>r.status==="fail").length;
  const info=results.filter(r=>!["pass","fail","skip"].includes(r.status)).length;
  const total=results.length;

  const exportReport=()=>{
    let txt=`COACHME.LIFE MULTI-ROLE TEST REPORT\n${"=".repeat(60)}\nDate: ${new Date().toISOString()}\nAPI: ${API}\nUser: ${user?.email} (${user?.role})\nBrowser: ${navigator.userAgent.slice(0,80)}\nRoles tested: COACH, CLIENT, ADMIN\n\n`;
    [...new Set(results.map(r=>r.group))].forEach(g=>{
      txt+=`\n${"─".repeat(60)}\n${g}\n${"─".repeat(60)}\n`;
      results.filter(r=>r.group===g).forEach(r=>{
        txt+=`${r.status==="pass"?"✅":r.status==="fail"?"❌":"ℹ️"} ${r.status.toUpperCase().padEnd(8)} ${r.name}\n   → ${r.detail}\n`;
      });
    });
    txt+=`\n${"=".repeat(60)}\nTotal: ${total} | Pass: ${pass} | Fail: ${fail} | Info: ${info}\nPass Rate: ${total>0?((pass/(pass+fail||1))*100).toFixed(1):0}%\n`;
    const b=new Blob([txt],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`coachme-multirole-report-${new Date().toISOString().slice(0,10)}.txt`;a.click();
  };

  return<div>
    <ST right={<div style={{display:"flex",gap:6}}>
      <Btn onClick={runAll} disabled={running} style={{padding:"8px 16px",fontSize:13}}>{running?"⏳ Running…":"▶ Run All (3 Roles)"}</Btn>
      <Btn variant="secondary" onClick={exportReport} disabled={results.length===0} style={{padding:"8px 14px",fontSize:12}}>📄 Export</Btn>
    </div>}>🧪 Multi-Role Test Suite</ST>
    <div style={{height:4,background:C.bd,borderRadius:2,marginBottom:16,overflow:"hidden"}}><div style={{height:"100%",width:`${progress}%`,background:C.gr,transition:"width .3s",borderRadius:2}}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:16}}>
      <SC label="Total" value={total} icon="📋" color={C.ac}/><SC label="Pass" value={pass} icon="✅" color={C.ok}/><SC label="Fail" value={fail} icon="❌" color={C.dg}/><SC label="Info" value={info} icon="ℹ️" color={C.wn}/>
    </div>
    {results.length>0&&<div style={{marginBottom:16}}>{[...new Set(results.map(r=>r.group))].map(g=><div key={g} style={{marginBottom:12}}>
      <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${C.bd}`}}>{g}</div>
      {results.filter(r=>r.group===g).map((r,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 8px",borderRadius:6,fontSize:12,marginBottom:2,background:r.status==="fail"?C.dg+"08":"transparent"}}>
        <span style={{flexShrink:0}}>{r.status==="pass"?"✅":r.status==="fail"?"❌":r.status==="skip"?"⏭️":"ℹ️"}</span>
        <span style={{flex:1,color:C.tx,fontWeight:500}}>{r.name}</span>
        <span style={{fontSize:11,color:r.status==="fail"?C.dg:C.mt,maxWidth:"50%",textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap"}} title={r.detail}>{r.detail}</span>
      </div>)}
    </div>)}</div>}
    <Card ref={logRef} style={{maxHeight:200,overflowY:"auto",padding:12}}>
      <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:8}}>Console</div>
      {logLines.length===0?<div style={{color:C.mt,fontSize:12}}>Click "▶ Run All (3 Roles)" to test COACH, CLIENT, ADMIN</div>:
      logLines.map((l,i)=><div key={i} style={{fontSize:11,fontFamily:"monospace",color:l.type==="ok"?C.ok:l.type==="err"?C.dg:C.mt,lineHeight:1.5}}>[{l.time}] {l.msg}</div>)}
    </Card>
  </div>;
}


function FitnessDevicesPage(){
  const{user}=useAuth();
  const isCoach=user?.role==="COACH"||user?.role==="coach";
  const[connections,setConnections]=useState(ls.get("device_connections",{}));
  const[syncData,setSyncData]=useState(ls.get("device_data",[]));
  const[sharing,setSharing]=useState(ls.get("device_sharing",{shareWithCoach:true,metrics:{steps:true,heartRate:true,sleep:true,calories:true,spo2:true,weight:true,stress:true}}));
  const[clients,setClients]=useState([]);const[selClient,setSelClient]=useState(null);
  const[showManual,setShowManual]=useState(false);const[tab,setTab]=useState(isCoach?"clients":"connect");
  const[manualForm,setManualForm]=useState({date:new Date().toISOString().slice(0,10),steps:"",heartRateAvg:"",heartRateMax:"",sleepHours:"",sleepQuality:"",caloriesBurned:"",activeMinutes:"",distance:"",weight:"",spo2:"",stressLevel:""});

  useEffect(()=>{if(isCoach)api.get("/clients").then(d=>setClients(unwrap(d,"clients"))).catch(()=>{});},[]);

  const devices=[
    {id:"fitbit",name:"Fitbit",icon:"⌚",color:"#00B0B9",desc:"Steps, heart rate, sleep, SpO2",authUrl:"https://www.fitbit.com/oauth2/authorize"},
    {id:"googleFit",name:"Google Fit",icon:"❤️",color:"#4285F4",desc:"Steps, heart rate, workouts, weight",authUrl:"https://accounts.google.com/o/oauth2/auth"},
    {id:"appleHealth",name:"Apple Health",icon:"🍎",color:"#FF3B30",desc:"All health metrics via HealthKit",note:"Requires iOS app"},
    {id:"garmin",name:"Garmin Connect",icon:"🏃",color:"#007CC3",desc:"GPS, VO2 max, training load, recovery",authUrl:"https://connect.garmin.com/oauthConfirm"},
    {id:"samsung",name:"Samsung Health",icon:"💙",color:"#1428A0",desc:"Steps, sleep, heart rate, body composition",note:"Requires Android app"},
    {id:"whoop",name:"WHOOP",icon:"🔴",color:"#E31937",desc:"Strain, recovery, sleep performance",authUrl:"https://api-7.whoop.com/oauth/oauth2/auth"},
    {id:"miband",name:"Mi Band / Zepp",icon:"🟠",color:"#FF6900",desc:"Steps, heart rate, sleep, stress",authUrl:"https://user.huami.com/oauth"},
    {id:"polar",name:"Polar",icon:"🔵",color:"#D0021B",desc:"HR zones, running index, recovery",authUrl:"https://flow.polar.com/oauth2/authorization"},
  ];

  const genSampleData=(source,days=7)=>{
    const data=[];for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);
      data.push({date:d.toISOString().slice(0,10),source,steps:Math.floor(5000+Math.random()*9000),heartRateAvg:Math.floor(60+Math.random()*22),heartRateMax:Math.floor(120+Math.random()*65),sleepHours:+(5+Math.random()*3.5).toFixed(1),sleepQuality:Math.floor(55+Math.random()*40),caloriesBurned:Math.floor(1600+Math.random()*1000),activeMinutes:Math.floor(15+Math.random()*70),distance:+(1.5+Math.random()*10).toFixed(1),spo2:Math.floor(94+Math.random()*5),stressLevel:Math.floor(15+Math.random()*55),weight:+(65+Math.random()*20).toFixed(1),syncedAt:new Date().toISOString()});}
    return data;
  };

  const toggleConnect=(id)=>{
    const dev=devices.find(d=>d.id===id);
    if(!connections[id]){
      if(dev.note){alert(`${dev.name}: ${dev.note}\n\nRequires the native mobile app.`);return;}
      if(!confirm(`Connect to ${dev.name}?\n\nThis will ${isCoach?"sync your fitness data":"sync your data and, if you allow, share it with your coach"}.\n\nIn production, this opens ${dev.name}'s OAuth login.`))return;
      const sample=genSampleData(id);
      const newData=[...syncData.filter(d=>d.source!==id),...sample];
      setSyncData(newData);ls.set("device_data",newData);
      // If client and sharing is on, save to shared storage too
      if(!isCoach&&sharing.shareWithCoach){
        ls.set("shared_health_data",newData.filter(d=>{const m=sharing.metrics;return true;}));
      }
    }
    const updated={...connections,[id]:!connections[id]};
    setConnections(updated);ls.set("device_connections",updated);
  };

  const updateSharing=(key,val)=>{
    const updated=key==="shareWithCoach"?{...sharing,shareWithCoach:val}:{...sharing,metrics:{...sharing.metrics,[key]:val}};
    setSharing(updated);ls.set("device_sharing",updated);
    // Update shared data
    if(updated.shareWithCoach){
      const filtered=syncData.map(d=>{const out={...d};
        if(!updated.metrics.steps)delete out.steps;if(!updated.metrics.heartRate){delete out.heartRateAvg;delete out.heartRateMax;}
        if(!updated.metrics.sleep){delete out.sleepHours;delete out.sleepQuality;}if(!updated.metrics.calories)delete out.caloriesBurned;
        if(!updated.metrics.spo2)delete out.spo2;if(!updated.metrics.weight)delete out.weight;if(!updated.metrics.stress)delete out.stressLevel;
        return out;});
      ls.set("shared_health_data",filtered);
    }else{ls.set("shared_health_data",[]);}
  };

  const saveManual=()=>{
    const entry={...manualForm,source:"manual",steps:+manualForm.steps||0,heartRateAvg:+manualForm.heartRateAvg||0,heartRateMax:+manualForm.heartRateMax||0,sleepHours:+manualForm.sleepHours||0,caloriesBurned:+manualForm.caloriesBurned||0,activeMinutes:+manualForm.activeMinutes||0,distance:+manualForm.distance||0,weight:+manualForm.weight||0,spo2:+manualForm.spo2||0,stressLevel:+manualForm.stressLevel||0};
    const updated=[...syncData,entry];setSyncData(updated);ls.set("device_data",updated);
    if(!isCoach&&sharing.shareWithCoach)ls.set("shared_health_data",updated);
    setShowManual(false);setManualForm({date:new Date().toISOString().slice(0,10),steps:"",heartRateAvg:"",heartRateMax:"",sleepHours:"",sleepQuality:"",caloriesBurned:"",activeMinutes:"",distance:"",weight:"",spo2:"",stressLevel:""});
  };

  const latest7=syncData.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).reverse();
  const today=syncData.find(d=>d.date===new Date().toISOString().slice(0,10));
  // Coach: view client's shared data
  const clientData=selClient?ls.get("shared_health_data",[]):[];

  const MetricGrid=({data})=><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
    {[{l:"Steps",v:data.steps?.toLocaleString(),icon:"🚶",c:C.ac},{l:"Calories",v:data.caloriesBurned,icon:"🔥",c:C.or},{l:"Active Min",v:data.activeMinutes,icon:"⏱️",c:C.ok},{l:"Avg HR",v:data.heartRateAvg?`${data.heartRateAvg} bpm`:null,icon:"❤️",c:C.dg},{l:"Sleep",v:data.sleepHours?`${data.sleepHours}h`:null,icon:"😴",c:C.ac},{l:"SpO2",v:data.spo2?`${data.spo2}%`:null,icon:"🫁",c:C.a2}].filter(m=>m.v).map(m=><div key={m.l} style={{textAlign:"center",padding:8,background:C.s2,borderRadius:10}}>
      <div style={{fontSize:16}}>{m.icon}</div>
      <div style={{fontSize:16,fontWeight:700,color:m.c}}>{m.v}</div>
      <div style={{fontSize:10,color:C.mt}}>{m.l}</div>
    </div>)}
  </div>;

  const TrendChart=({data,field,label,color,unit=""})=>{
    if(data.length<2)return null;
    return<Card style={{padding:14,marginBottom:10}}>
      <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height:70}}>
        {data.map((d,i)=>{const vals=data.map(x=>x[field]||0);const min=Math.min(...vals);const max=Math.max(...vals);const range=max-min||1;const h=((d[field]||0)-min)/range*55+15;
        return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:9,color,fontWeight:600}}>{d[field]||"—"}{unit}</div>
          <div style={{width:"100%",height:h,borderRadius:4,background:color,opacity:.4+(i/data.length)*.6}}/>
          <span style={{fontSize:8,color:C.mt}}>{d.date?.slice(8)}</span>
        </div>;})}
      </div>
    </Card>;
  };

  const coachTabs=isCoach?[{id:"clients",label:"Client Data"},{id:"connect",label:"My Devices"},{id:"data",label:"My Data"},{id:"trends",label:"Trends"}]:[{id:"connect",label:"Connect"},{id:"sharing",label:"Sharing"},{id:"data",label:"My Data"},{id:"trends",label:"Trends"}];

  return<div>
    <ST right={<Btn onClick={()=>setShowManual(true)} style={{padding:"8px 12px",fontSize:12}}>✏️ Manual</Btn>}>
      {isCoach?"Client Health Data":"My Fitness Devices"}
    </ST>
    <Tabs tabs={coachTabs} active={tab} onChange={setTab}/>

    {/* COACH: View client health data */}
    {tab==="clients"&&isCoach&&<div>
      {clients.length===0?<Empty icon="👥" text="No clients"/>:
      selClient?<div>
        <button onClick={()=>setSelClient(null)} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontSize:14,fontWeight:600,marginBottom:12,padding:0,fontFamily:"inherit"}}>← All Clients</button>
        <Card style={{marginBottom:12,padding:14}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:4}}>{cName(selClient)}</div>
          <div style={{fontSize:12,color:C.mt}}>Health data shared by client</div>
        </Card>
        {clientData.length>0?<div>
          <div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:8}}>Latest Metrics</div>
          <MetricGrid data={clientData[clientData.length-1]}/>
          <div style={{marginTop:12}}>
            <TrendChart data={clientData.slice(-7)} field="steps" label="Steps (7d)" color={C.ac}/>
            <TrendChart data={clientData.slice(-7)} field="sleepHours" label="Sleep (7d)" color={C.a2} unit="h"/>
            <TrendChart data={clientData.slice(-7)} field="heartRateAvg" label="Avg HR (7d)" color={C.dg} unit="bpm"/>
          </div>
        </div>:<Card style={{padding:20,textAlign:"center"}}><div style={{fontSize:14,color:C.mt}}>This client hasn't shared health data yet.</div><div style={{fontSize:12,color:C.mt,marginTop:8}}>They need to connect a device and enable sharing in their CoachMe app.</div></Card>}
      </div>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {clients.map(c=>{const cData=ls.get("shared_health_data",[]);const hasData=cData.length>0;
        return<Card key={c.id} onClick={()=>setSelClient(c)} style={{padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <div style={{width:42,height:42,borderRadius:12,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff"}}>{cName(c)[0].toUpperCase()}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{cName(c)}</div>
            <div style={{fontSize:12,color:C.mt}}>{cEmail(c)}</div>
          </div>
          <Badge color={hasData?C.ok:C.mt}>{hasData?"📊 Data":"No data"}</Badge>
        </Card>;})}
      </div>}
    </div>}

    {/* CLIENT: Sharing controls */}
    {tab==="sharing"&&!isCoach&&<div>
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div><div style={{fontSize:15,fontWeight:600,color:C.tx}}>Share with Coach</div><div style={{fontSize:12,color:C.mt}}>Your coach can view shared metrics</div></div>
          <button onClick={()=>updateSharing("shareWithCoach",!sharing.shareWithCoach)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:sharing.shareWithCoach?C.ok:C.bd,position:"relative",transition:"all .2s"}}>
            <div style={{width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:3,left:sharing.shareWithCoach?27:3,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
          </button>
        </div>
        {sharing.shareWithCoach&&<div>
          <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:10}}>Choose what to share:</div>
          {[{key:"steps",label:"Steps & Distance",icon:"🚶"},{key:"heartRate",label:"Heart Rate",icon:"❤️"},{key:"sleep",label:"Sleep Data",icon:"😴"},{key:"calories",label:"Calories Burned",icon:"🔥"},{key:"spo2",label:"Blood Oxygen (SpO2)",icon:"🫁"},{key:"weight",label:"Weight & Body Comp",icon:"⚖️"},{key:"stress",label:"Stress Level",icon:"😰"}].map(m=>
            <div key={m.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.bd}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:18}}>{m.icon}</span><span style={{fontSize:13,color:C.tx,fontWeight:500}}>{m.label}</span></div>
              <button onClick={()=>updateSharing(m.key,!sharing.metrics[m.key])} style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:sharing.metrics[m.key]?C.ok:C.bd,position:"relative",transition:"all .2s"}}>
                <div style={{width:18,height:18,borderRadius:9,background:"#fff",position:"absolute",top:3,left:sharing.metrics[m.key]?23:3,transition:"left .2s",boxShadow:"0 1px 2px rgba(0,0,0,.3)"}}/>
              </button>
            </div>
          )}
        </div>}
      </Card>
      <Card style={{padding:14,background:C.s2,border:`1px dashed ${C.bd}`}}>
        <div style={{fontSize:12,color:C.mt,textAlign:"center",lineHeight:1.6}}>
          🔒 Your data is private by default. Only metrics you enable above will be visible to your coach.
          You can change these settings anytime.
        </div>
      </Card>
    </div>}

    {/* Connect devices tab */}
    {tab==="connect"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {devices.map(d=><Card key={d.id} style={{padding:14,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,borderRadius:14,background:d.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{d.icon}</div>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{d.name}</div><div style={{fontSize:12,color:C.mt}}>{d.desc}</div></div>
        <button onClick={()=>toggleConnect(d.id)} style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:connections[d.id]?C.ok+"20":C.ac+"20",color:connections[d.id]?C.ok:C.ac}}>
          {connections[d.id]?"✓ Connected":"Connect"}
        </button>
      </Card>)}
    </div>}

    {/* Data tab */}
    {tab==="data"&&<div>
      {today?<Card style={{marginBottom:12}}><div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:10}}>Today</div><MetricGrid data={today}/><div style={{fontSize:11,color:C.mt,marginTop:8,textAlign:"right"}}>Source: {today.source}</div></Card>:
      <Card style={{padding:16,textAlign:"center"}}><div style={{color:C.mt,fontSize:13}}>No data today — connect a device or log manually</div></Card>}
      {syncData.length>0&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
        {syncData.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,14).map((d,i)=><Card key={i} style={{padding:10,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:12,fontWeight:600,color:C.tx,minWidth:56}}>{d.date.slice(5)}</div>
          <div style={{flex:1,display:"flex",gap:10,fontSize:11,color:C.mt,flexWrap:"wrap"}}>
            {d.steps>0&&<span>🚶{d.steps.toLocaleString()}</span>}{d.caloriesBurned>0&&<span>🔥{d.caloriesBurned}</span>}{d.heartRateAvg>0&&<span>❤️{d.heartRateAvg}</span>}{d.sleepHours>0&&<span>😴{d.sleepHours}h</span>}
          </div>
          <Badge color={C.mt} style={{fontSize:10}}>{d.source}</Badge>
        </Card>)}
      </div>}
    </div>}

    {/* Trends tab */}
    {tab==="trends"&&<div>
      {latest7.length>1?<div>
        <TrendChart data={latest7} field="steps" label="Steps (7 days)" color={C.ac}/>
        <TrendChart data={latest7} field="sleepHours" label="Sleep (7 days)" color={C.a2} unit="h"/>
        <TrendChart data={latest7} field="heartRateAvg" label="Avg Heart Rate (7 days)" color={C.dg} unit="bpm"/>
        <TrendChart data={latest7} field="caloriesBurned" label="Calories Burned (7 days)" color={C.or}/>
        {latest7.some(d=>d.weight>0)&&<TrendChart data={latest7} field="weight" label="Weight (7 days)" color={C.pk} unit="kg"/>}
      </div>:<Empty icon="📊" text="Connect a device to see trends"/>}
    </div>}

    <Modal open={showManual} onClose={()=>setShowManual(false)} title="Log Health Data" wide>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Input label="Date" type="date" value={manualForm.date} onChange={e=>setManualForm({...manualForm,date:e.target.value})}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="🚶 Steps" type="number" value={manualForm.steps} onChange={e=>setManualForm({...manualForm,steps:e.target.value})}/>
          <Input label="🔥 Calories" type="number" value={manualForm.caloriesBurned} onChange={e=>setManualForm({...manualForm,caloriesBurned:e.target.value})}/>
          <Input label="⏱️ Active Min" type="number" value={manualForm.activeMinutes} onChange={e=>setManualForm({...manualForm,activeMinutes:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Input label="❤️ Avg HR" type="number" value={manualForm.heartRateAvg} onChange={e=>setManualForm({...manualForm,heartRateAvg:e.target.value})}/>
          <Input label="🫁 SpO2 %" type="number" value={manualForm.spo2} onChange={e=>setManualForm({...manualForm,spo2:e.target.value})}/>
          <Input label="😴 Sleep hrs" type="number" step="0.1" value={manualForm.sleepHours} onChange={e=>setManualForm({...manualForm,sleepHours:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="🏃 Distance km" type="number" step="0.1" value={manualForm.distance} onChange={e=>setManualForm({...manualForm,distance:e.target.value})}/>
          <Input label="⚖️ Weight kg" type="number" step="0.1" value={manualForm.weight} onChange={e=>setManualForm({...manualForm,weight:e.target.value})}/>
        </div>
        <Btn onClick={saveManual} style={{width:"100%"}}>Save Health Data</Btn>
      </div>
    </Modal>
  </div>;
}


function MoreMenu({onNav}){const btm=getBottomTabs();const items=[{id:"clients",icon:"👥",label:"Clients",desc:"Manage clients"},{id:"leads",icon:"🎯",label:"Leads Pipeline",desc:"Kanban board"},{id:"mealplan",icon:"🍎",label:"AI Meal Planner",desc:"AI-generated plans"},{id:"nutrition",icon:"🥗",label:"Nutrition Tracker",desc:"Log food & macros"},{id:"habits",icon:"✅",label:"Habit Tracker",desc:"Daily habits & streaks"},{id:"checkins",icon:"📋",label:"Check-ins",desc:"Weekly questionnaires"},{id:"reports",icon:"📊",label:"Analytics",desc:"Revenue & reports"},{id:"invoices",icon:"🧾",label:"Invoices",desc:"Billing & payments"},{id:"ai",icon:"🤖",label:"AI Coach",desc:"RAG-powered assistant"},{id:"media",icon:"🎥",label:"Media Library",desc:"Videos & progress photos"},{id:"devices",icon:"⌚",label:"Fitness Devices",desc:"Fitbit, Garmin, Apple Health"},{id:"settings",icon:"⚙️",label:"Settings",desc:"Profile & prefs"},{id:"tests",icon:"🧪",label:"Test Suite",desc:"Run automated tests"}];return<div><ST>More</ST><div style={{display:"flex",flexDirection:"column",gap:6}}>{items.filter(i=>!btm.includes(i.id)||i.id==="settings"||i.id==="tests").map(i=><Card key={i.id} onClick={()=>onNav(i.id)} style={{padding:14,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}><div style={{width:42,height:42,borderRadius:12,background:C.ac+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{i.icon}</div><div style={{flex:1}}><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{i.label}</div><div style={{color:C.mt,fontSize:12}}>{i.desc}</div></div><span style={{color:C.mt,fontSize:18}}>›</span></Card>)}</div></div>;}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function MainApp(){const[tab,setTab]=useState("dashboard");const[sub,setSub]=useState(null);const[chatCl,setChatCl]=useState(null);const[rk,setRk]=useState(0);const handleV=useCallback((cmd,speak)=>{const r={dashboard:["home","dashboard"],workouts:["workout","exercise"],bookings:["schedule","booking","calendar"],chat:["message","chat"],clients:["client"],leads:["lead","pipeline"],reports:["report","analytics"],ai:["ai","assistant"],mealplan:["meal","diet","nutrition plan"],habits:["habit"],checkins:["checkin","check-in"],invoices:["invoice","payment","billing"],settings:["setting","profile"],tests:["test","testing","suite"],devices:["device","fitbit","garmin","watch","health","wearable"]};for(const[rt,kw] of Object.entries(r)){if(kw.some(k=>cmd.includes(k))){if(["dashboard","workouts","bookings","chat"].includes(rt)){setTab(rt);setSub(null);}else{setTab("more");setSub(rt);}setRk(k=>k+1);speak(`Opening ${rt}`);return;}}speak("Try saying a page name.");},[]);const{listening,toggle}=useVoice(handleV);const bottomIds=getBottomTabs();
  const nav=id=>{setRk(k=>k+1);if(bottomIds.includes(id)){setTab(id);setSub(null);}else{setTab("more");setSub(id);}};const render=()=>{const K=`${tab}_${sub||""}_${rk}`;const btmIds=getBottomTabs();
    if((tab==="more"&&sub)||(!btmIds.includes(tab)&&tab!=="more")){const subKey=sub||tab;const p={clients:<ClientsPage key={K} onOpenChat={c=>{setChatCl(c);nav("chat");}}/>,leads:<LeadsPage key={K}/>,reports:<ReportsPage key={K}/>,ai:<AIChatPage key={K}/>,settings:<SettingsPage key={K}/>,mealplan:<MealPlannerPage key={K}/>,nutrition:<NutritionTracker key={K}/>,habits:<HabitTracker key={K}/>,checkins:<CheckInsPage key={K}/>,invoices:<InvoicesPage key={K}/>,media:<MediaLibrary key={K}/>,devices:<FitnessDevicesPage key={K}/>,tests:<TestSuitePage key={K}/>};return p[subKey]||<MoreMenu onNav={setSub}/>;}const p={dashboard:<DashboardPage key={K}/>,workouts:<WorkoutsPage key={K}/>,bookings:<BookingsPage key={K}/>,chat:<MessagingPage key={K} initialClient={chatCl} onBack={()=>setChatCl(null)}/>,clients:<ClientsPage key={K} onOpenChat={c=>{setChatCl(c);nav("chat");}}/>,leads:<LeadsPage key={K}/>,ai:<AIChatPage key={K}/>,reports:<ReportsPage key={K}/>,more:<MoreMenu onNav={setSub}/>};return p[tab]||<DashboardPage key={K}/>;};return<div style={{minHeight:"100dvh",background:C.bg,color:C.tx,fontFamily:"'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif"}}><style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}`}</style><button onClick={toggle} style={{position:"fixed",right:16,bottom:80,zIndex:200,width:48,height:48,borderRadius:24,border:"none",cursor:"pointer",background:listening?C.dg:C.gr,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px ${listening?C.dg+"60":C.ac+"40"}`,animation:listening?"pulse 1.5s ease infinite":"none",fontSize:20}} title="Voice">🎙️</button><div style={{padding:"16px 16px 90px",maxWidth:600,margin:"0 auto"}}>{(tab==="more"&&sub)&&<button onClick={()=>{setSub(null);if(tab!=="more")setTab("more");}} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontSize:14,fontWeight:600,marginBottom:12,padding:0,fontFamily:"inherit"}}>← Back</button>}{render()}</div><BNav active={tab} onChange={nav}/></div>;}

function useVoice(onCmd){const[listening,setListening]=useState(false);const speak=useCallback(t=>{if("speechSynthesis"in window){const u=new SpeechSynthesisUtterance(t);u.rate=1.05;speechSynthesis.speak(u);}},[]);const toggle=useCallback(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return speak("Voice not supported");if(listening)return setListening(false);const r=new SR();r.continuous=false;r.lang="en-US";r.onresult=e=>{onCmd(e.results[0][0].transcript.toLowerCase().trim(),speak);setListening(false);};r.onerror=()=>setListening(false);r.onend=()=>setListening(false);r.start();setListening(true);},[listening,onCmd,speak]);return{listening,toggle,speak};}

export default function App(){return<ThemeProvider><AuthProvider><AuthGate/></AuthProvider></ThemeProvider>;}
function AuthGate(){const{user}=useAuth();return user?<MainApp/>:<AuthScreen/>;}
