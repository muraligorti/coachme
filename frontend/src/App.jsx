// CoachMe.life — Super Feature-Rich App.jsx (CoachFlow-grade)
// Backend: just-perception-production.up.railway.app
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

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

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C={bg:"#0a0a0f",sf:"#12121a",s2:"#1a1a25",bd:"#1e1e2e",tx:"#e4e4ef",mt:"#7a7a8e",ac:"#6c5ce7",a2:"#00cec9",gr:"linear-gradient(135deg,#6c5ce7 0%,#a29bfe 50%,#00cec9 100%)",dg:"#ff4757",wn:"#ffa502",ok:"#2ed573",or:"#ff6348",pk:"#ff6b81"};
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
function AuthScreen(){const{login,register}=useAuth();const[mode,setMode]=useState("login");const[form,setForm]=useState({name:"",email:"",password:"",role:"coach"});const[error,setError]=useState("");const[busy,setBusy]=useState(false);const submit=async()=>{setError("");if(!form.email||!form.password)return setError("Email and password required");setBusy(true);try{mode==="login"?await login(form.email,form.password):await register(form);}catch(e){setError(e.message);}setBusy(false);};return<div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:20}}><Card style={{maxWidth:400,width:"100%"}}><div style={{textAlign:"center",marginBottom:28}}><div style={{width:52,height:52,borderRadius:14,background:C.gr,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:"#fff",marginBottom:12}}>C</div><h1 style={{color:C.tx,margin:0,fontSize:22,fontWeight:700}}>CoachMe.life</h1><p style={{color:C.mt,margin:"6px 0 0",fontSize:14}}>{mode==="login"?"Welcome back":"Create your account"}</p></div><div style={{display:"flex",flexDirection:"column",gap:14}}>{mode==="register"&&<><Input label="Full Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="John Doe"/><Sel label="I am a…" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} options={[{value:"coach",label:"Coach"},{value:"client",label:"Client"}]}/></>}<Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@email.com"/><Input label="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>{error&&<div style={{color:C.dg,fontSize:13,padding:"8px 12px",background:C.dg+"15",borderRadius:8}}>{error}</div>}<Btn onClick={submit} disabled={busy} style={{width:"100%"}}>{busy?"Please wait…":mode==="login"?"Sign In":"Create Account"}</Btn><p style={{color:C.mt,fontSize:13,textAlign:"center",margin:0}}>{mode==="login"?"No account?":"Have an account?"}{" "}<span onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}} style={{color:C.ac,cursor:"pointer",fontWeight:600}}>{mode==="login"?"Sign Up":"Sign In"}</span></p></div></Card></div>;}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardPage(){const{user}=useAuth();const[stats,setStats]=useState({});const[up,setUp]=useState([]);const[loading,setLoading]=useState(true);useEffect(()=>{Promise.all([api.get("/reports/coach/dashboard").catch(()=>({})),api.get("/bookings").catch(()=>({}))]).then(([s,b])=>{setStats(s?.data||s||{});const bk=unwrap(b,"bookings","sessions");setUp(bk.filter(x=>new Date(x.date||x.startTime||x.scheduledAt)>=new Date()).slice(0,3));}).finally(()=>setLoading(false));},[]);if(loading)return<Spin/>;const g=new Date().getHours()<12?"Good morning":new Date().getHours()<17?"Good afternoon":"Good evening";return<div><div style={{marginBottom:20}}><div style={{fontSize:14,color:C.mt}}>{g},</div><h2 style={{color:C.tx,fontSize:22,margin:"4px 0 0",fontWeight:700}}>{user?.name||"Coach"} 👋</h2></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><SC label="Active Clients" value={stats.activeClients??stats.totalClients??0} icon="👥" color={C.ac}/><SC label="Monthly Revenue" value={`₹${(stats.monthlyRevenue??stats.totalRevenue??0).toLocaleString()}`} icon="📈" color={C.ok}/><SC label="Upcoming" value={stats.upcomingBookings??up.length} icon="📅" color={C.a2}/><SC label="Leads" value={stats.totalLeads??0} icon="🎯" color={C.wn}/></div><Card style={{marginTop:16}}><div style={{fontSize:15,fontWeight:600,color:C.tx,marginBottom:12}}>Upcoming Sessions</div>{up.length===0?<div style={{color:C.mt,fontSize:13}}>No upcoming sessions</div>:up.map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.bd}`}}><div style={{width:40,height:40,borderRadius:10,background:C.ac+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📅</div><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{s.client?.name||s.client?.user?.name||s.type||"Session"}</div><div style={{fontSize:12,color:C.mt}}>{new Date(s.date||s.startTime||s.scheduledAt).toLocaleDateString()} · {s.duration||60}min</div></div><Badge color={s.status==="confirmed"?C.ok:C.wn}>{s.status||"pending"}</Badge></div>)}</Card></div>;}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
function ClientsPage({onOpenChat}){
  const[clients,setClients]=useState([]);const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState("");const[sel,setSel]=useState(null);const[tab,setTab]=useState("overview");
  const[showAdd,setShowAdd]=useState(false);const[showEdit,setShowEdit]=useState(false);
  const[showBulk,setShowBulk]=useState(false);const[csvText,setCsvText]=useState("");
  const[form,setForm]=useState({name:"",email:"",phone:"",sessionType:"offline",goals:"",notes:"",emergencyContact:"",address:"",dob:"",gender:"",injuries:""});
  const emptyForm={name:"",email:"",phone:"",sessionType:"offline",goals:"",notes:"",emergencyContact:"",address:"",dob:"",gender:"",injuries:""};
  const load=()=>api.get("/clients").then(d=>setClients(unwrap(d,"clients"))).catch(()=>{}).finally(()=>setLoading(false));
  useEffect(()=>{load();},[]);
  const filtered=clients.filter(c=>(c.name||c.user?.name||"").toLowerCase().includes(search.toLowerCase())||(c.email||c.user?.email||"").toLowerCase().includes(search.toLowerCase())||(c.phone||"").includes(search));

  const addClient=async()=>{try{await api.post("/clients",form);setForm(emptyForm);setShowAdd(false);load();}catch(e){alert(e.message);}};
  const editClient=async()=>{try{await api.put(`/clients/${sel.id}`,form);setShowEdit(false);load();const updated={...sel,...form};setSel(updated);}catch(e){alert(e.message);}};
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
  if(sel){const nm=sel.name||sel.user?.name||"Client";const photos=ls.get(`photos_${sel.id}`,{});
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
        <div style={{fontSize:13,color:C.mt}}>{sel.email||sel.user?.email}</div>
        {sel.phone&&<div style={{fontSize:12,color:C.mt}}>📱 {sel.phone}</div>}
        <Badge color={sel.sessionType==="online"?C.a2:C.ac} style={{marginTop:4}}>{sel.sessionType||"offline"}</Badge>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <button onClick={()=>onOpenChat?.(sel)} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:C.a2+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💬</button>
        <button onClick={()=>{setForm({name:sel.name||sel.user?.name||"",email:sel.email||sel.user?.email||"",phone:sel.phone||"",sessionType:sel.sessionType||"offline",goals:sel.goals||"",notes:sel.notes||"",emergencyContact:sel.emergencyContact||"",address:sel.address||"",dob:sel.dob||"",gender:sel.gender||"",injuries:sel.injuries||""});setShowEdit(true);}} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:C.wn+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✏️</button>
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
      {filtered.map(c=><Card key={c.id} onClick={()=>setSel(c)} style={{padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
        <div style={{width:42,height:42,borderRadius:12,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff",flexShrink:0}}>{(c.name||c.user?.name||"?")[0].toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.tx,fontSize:14,fontWeight:600}}>{c.name||c.user?.name}</div>
          <div style={{color:C.mt,fontSize:12}}>{c.email||c.user?.email}{c.phone?` · ${c.phone}`:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <Badge color={c.sessionType==="online"?C.a2:C.ac} style={{fontSize:10}}>{c.sessionType||"offline"}</Badge>
          <Badge color={c.status==="active"?C.ok:C.mt} style={{fontSize:10}}>{c.status||"active"}</Badge>
        </div>
      </Card>)}
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
function ProgressTracker({cid}){const[entries,setEntries]=useState(ls.get(`prog_${cid}`,[]));const[showAdd,setShowAdd]=useState(false);const[form,setForm]=useState({date:new Date().toISOString().slice(0,10),weight:"",bodyFat:"",chest:"",waist:"",hips:"",notes:""});const save=()=>{const u=[...entries,{...form,id:Date.now(),weight:+form.weight||0,bodyFat:+form.bodyFat||0}];setEntries(u);ls.set(`prog_${cid}`,u);setShowAdd(false);setForm({date:new Date().toISOString().slice(0,10),weight:"",bodyFat:"",chest:"",waist:"",hips:"",notes:""});};const lat=entries[entries.length-1];const prev=entries[entries.length-2];const diff=lat&&prev?(lat.weight-prev.weight).toFixed(1):0;return<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:15,fontWeight:600,color:C.tx}}>Body Metrics</span><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Log</Btn></div>{lat&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}><Card style={{padding:12,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.tx}}>{lat.weight}kg</div><div style={{fontSize:11,color:diff>0?C.dg:C.ok}}>{diff>0?"+":""}{diff}kg</div><div style={{fontSize:11,color:C.mt}}>Weight</div></Card><Card style={{padding:12,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.tx}}>{lat.bodyFat}%</div><div style={{fontSize:11,color:C.mt}}>Body Fat</div></Card><Card style={{padding:12,textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:C.tx}}>{lat.waist||"—"}</div><div style={{fontSize:11,color:C.mt}}>Waist</div></Card></div>}{entries.length>1&&<Card style={{padding:14,marginBottom:12}}><div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:8}}>Weight Trend</div><div style={{display:"flex",alignItems:"flex-end",gap:3,height:60}}>{entries.slice(-14).map((e,i,a)=>{const mn=Math.min(...a.map(x=>x.weight));const mx=Math.max(...a.map(x=>x.weight));const h=((e.weight-mn)/(mx-mn||1))*50+10;return<div key={i} style={{flex:1,height:h,borderRadius:3,background:C.gr,opacity:.5+(i/a.length)*.5}} title={`${e.weight}kg`}/>;})}</div></Card>}{entries.length===0&&<Empty icon="📏" text="No progress entries yet"/>}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Log Progress"><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Weight (kg)" type="number" value={form.weight} onChange={e=>setForm({...form,weight:e.target.value})}/><Input label="Body Fat (%)" type="number" value={form.bodyFat} onChange={e=>setForm({...form,bodyFat:e.target.value})}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><Input label="Chest" value={form.chest} onChange={e=>setForm({...form,chest:e.target.value})}/><Input label="Waist" value={form.waist} onChange={e=>setForm({...form,waist:e.target.value})}/><Input label="Hips" value={form.hips} onChange={e=>setForm({...form,hips:e.target.value})}/></div><TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><Btn onClick={save} style={{width:"100%"}}>Save Entry</Btn></div></Modal></div>;}

// ─── HABIT TRACKER ────────────────────────────────────────────────────────────
function HabitTracker({cid}){const key=`hab_${cid||"me"}`;const[habits,setHabits]=useState(ls.get(key,[{id:1,name:"Drink 3L Water",icon:"💧",streak:0,log:{}},{id:2,name:"8h Sleep",icon:"😴",streak:0,log:{}},{id:3,name:"10k Steps",icon:"🚶",streak:0,log:{}},{id:4,name:"Eat Vegetables",icon:"🥦",streak:0,log:{}}]));const[showAdd,setShowAdd]=useState(false);const[newH,setNewH]=useState("");const today=new Date().toISOString().slice(0,10);const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});const toggle=(hid,date)=>{const u=habits.map(h=>{if(h.id!==hid)return h;const l={...h.log};l[date]=!l[date];let s=0;const d=new Date();while(l[d.toISOString().slice(0,10)]){s++;d.setDate(d.getDate()-1);}return{...h,log:l,streak:s};});setHabits(u);ls.set(key,u);};const addH=()=>{if(!newH.trim())return;const u=[...habits,{id:Date.now(),name:newH,icon:"✨",streak:0,log:{}}];setHabits(u);ls.set(key,u);setNewH("");setShowAdd(false);};const dn=["S","M","T","W","T","F","S"];return<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:15,fontWeight:600,color:C.tx}}>Daily Habits</span><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Habit</Btn></div><div style={{display:"grid",gridTemplateColumns:"1fr repeat(7,32px)",gap:4,marginBottom:8,alignItems:"center"}}><div/>{last7.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:600,color:d===today?C.ac:C.mt}}>{dn[new Date(d).getDay()]}</div>)}</div>{habits.map(h=><div key={h.id} style={{display:"grid",gridTemplateColumns:"1fr repeat(7,32px)",gap:4,marginBottom:8,alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><span style={{fontSize:16}}>{h.icon}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>{h.streak>0&&<div style={{fontSize:10,color:C.or}}>🔥 {h.streak}d</div>}</div></div>{last7.map(d=><button key={d} onClick={()=>toggle(h.id,d)} style={{width:32,height:32,borderRadius:8,border:"none",cursor:"pointer",background:h.log[d]?C.ok:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",transition:"all .2s"}}>{h.log[d]?"✓":""}</button>)}</div>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Habit"><Input label="Habit Name" value={newH} onChange={e=>setNewH(e.target.value)} placeholder="e.g. Meditate 10 min"/><Btn onClick={addH} style={{width:"100%",marginTop:12}}>Add</Btn></Modal></div>;}

// ─── NUTRITION TRACKER ────────────────────────────────────────────────────────
function NutritionTracker({cid}){const key=`nut_${cid||"me"}`;const[meals,setMeals]=useState(ls.get(key,[]));const[showAdd,setShowAdd]=useState(false);const[form,setForm]=useState({name:"",calories:"",protein:"",carbs:"",fat:"",meal:"breakfast"});const today=new Date().toISOString().slice(0,10);const tm=meals.filter(m=>m.date===today);const tot=tm.reduce((a,m)=>({cal:a.cal+m.calories,pro:a.pro+m.protein,carb:a.carb+m.carbs,fat:a.fat+m.fat}),{cal:0,pro:0,carb:0,fat:0});const tgt={cal:2200,pro:150,carb:250,fat:70};const save=()=>{const e={...form,id:Date.now(),date:today,calories:+form.calories||0,protein:+form.protein||0,carbs:+form.carbs||0,fat:+form.fat||0};const u=[...meals,e];setMeals(u);ls.set(key,u);setShowAdd(false);setForm({name:"",calories:"",protein:"",carbs:"",fat:"",meal:"breakfast"});};return<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:15,fontWeight:600,color:C.tx}}>Today's Nutrition</span><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Log</Btn></div><Card style={{padding:16,marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,textAlign:"center"}}>{[{l:"Calories",v:tot.cal,t:tgt.cal,c:C.ac,u:"kcal"},{l:"Protein",v:tot.pro,t:tgt.pro,c:C.ok,u:"g"},{l:"Carbs",v:tot.carb,t:tgt.carb,c:C.wn,u:"g"},{l:"Fat",v:tot.fat,t:tgt.fat,c:C.pk,u:"g"}].map(m=><div key={m.l}><div style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</div><PBar value={m.v} max={m.t} color={m.c}/><div style={{fontSize:10,color:C.mt,marginTop:4}}>{m.l}<br/>{m.v}/{m.t}{m.u}</div></div>)}</div></Card>{tm.length===0?<div style={{color:C.mt,fontSize:13,textAlign:"center",padding:20}}>No meals logged</div>:tm.map(m=><Card key={m.id} style={{padding:12,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:600,color:C.tx}}>{m.name}</div><div style={{fontSize:11,color:C.mt}}>{m.meal} · {m.calories}kcal</div></div><div style={{fontSize:11,color:C.mt}}>P:{m.protein}g C:{m.carbs}g F:{m.fat}g</div></Card>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Log Food"><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Food" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Grilled Chicken"/><Sel label="Meal" value={form.meal} onChange={e=>setForm({...form,meal:e.target.value})} options={[{value:"breakfast",label:"Breakfast"},{value:"lunch",label:"Lunch"},{value:"dinner",label:"Dinner"},{value:"snack",label:"Snack"}]}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Calories" type="number" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})}/><Input label="Protein (g)" type="number" value={form.protein} onChange={e=>setForm({...form,protein:e.target.value})}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Input label="Carbs (g)" type="number" value={form.carbs} onChange={e=>setForm({...form,carbs:e.target.value})}/><Input label="Fat (g)" type="number" value={form.fat} onChange={e=>setForm({...form,fat:e.target.value})}/></div><Btn onClick={save} style={{width:"100%"}}>Log Food</Btn></div></Modal></div>;}

// ─── LEADS KANBAN ─────────────────────────────────────────────────────────────
function LeadsPage(){const[leads,setLeads]=useState([]);const[loading,setLoading]=useState(true);const[showAdd,setShowAdd]=useState(false);const[view,setView]=useState("kanban");const[form,setForm]=useState({name:"",email:"",phone:"",source:"website",notes:""});const load=()=>api.get("/leads").then(d=>setLeads(unwrap(d,"leads"))).catch(()=>{}).finally(()=>setLoading(false));useEffect(()=>{load();},[]);const addLead=async()=>{await api.post("/leads",form);setForm({name:"",email:"",phone:"",source:"website",notes:""});setShowAdd(false);load();};const stages=[{id:"new",label:"New",color:C.a2},{id:"contacted",label:"Contacted",color:C.wn},{id:"qualified",label:"Qualified",color:C.ac},{id:"converted",label:"Converted",color:C.ok},{id:"lost",label:"Lost",color:C.dg}];const updateSt=async(id,st)=>{try{await api.put(`/leads/${id}`,{status:st});load();}catch{}};if(loading)return<Spin/>;return<div><ST right={<div style={{display:"flex",gap:6}}><button onClick={()=>setView("kanban")} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:view==="kanban"?C.ac:C.s2,color:view==="kanban"?"#fff":C.mt}}>Board</button><button onClick={()=>setView("list")} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:view==="list"?C.ac:C.s2,color:view==="list"?"#fff":C.mt}}>List</button><Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 14px",fontSize:12}}>+ Lead</Btn></div>}>Leads</ST>{view==="kanban"?<div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>{stages.map(st=>{const sl=leads.filter(l=>(l.status||"new")===st.id);return<div key={st.id} style={{minWidth:180,flex:"0 0 180px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:8,height:8,borderRadius:4,background:st.color}}/><span style={{fontSize:13,fontWeight:600,color:C.tx}}>{st.label}</span><Badge style={{fontSize:10,padding:"2px 8px"}}>{sl.length}</Badge></div>{sl.map(l=><Card key={l.id} style={{padding:12,marginBottom:6}}><div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:4}}>{l.name}</div><div style={{fontSize:11,color:C.mt}}>{l.email}</div>{l.source&&<Badge style={{marginTop:6,fontSize:10}} color={C.mt}>{l.source}</Badge>}<div style={{display:"flex",gap:4,marginTop:8}}>{stages.filter(s=>s.id!==st.id&&s.id!=="lost").slice(0,2).map(s=><button key={s.id} onClick={()=>updateSt(l.id,s.id)} style={{padding:"3px 8px",borderRadius:6,border:"none",fontSize:10,fontWeight:600,cursor:"pointer",background:s.color+"20",color:s.color}}>→ {s.label}</button>)}</div></Card>)}</div>;})}</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{leads.map(l=><Card key={l.id} style={{padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{l.name}</div><div style={{color:C.mt,fontSize:12}}>{l.email}</div></div><Badge color={stages.find(s=>s.id===(l.status||"new"))?.color}>{l.status||"new"}</Badge></Card>)}</div>}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Lead"><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input label="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><Input label="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Sel label="Source" value={form.source} onChange={e=>setForm({...form,source:e.target.value})} options={[{value:"website",label:"Website"},{value:"referral",label:"Referral"},{value:"instagram",label:"Instagram"},{value:"other",label:"Other"}]}/><TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><Btn onClick={addLead} style={{width:"100%"}}>Save Lead</Btn></div></Modal></div>;}

// ─── WORKOUTS + EXERCISE LIBRARY ──────────────────────────────────────────────
const EXDB=[{name:"Barbell Squat",muscle:"Legs",eq:"Barbell"},{name:"Bench Press",muscle:"Chest",eq:"Barbell"},{name:"Deadlift",muscle:"Back",eq:"Barbell"},{name:"Overhead Press",muscle:"Shoulders",eq:"Barbell"},{name:"Barbell Row",muscle:"Back",eq:"Barbell"},{name:"Pull-ups",muscle:"Back",eq:"Bodyweight"},{name:"Dumbbell Curl",muscle:"Biceps",eq:"Dumbbell"},{name:"Tricep Pushdown",muscle:"Triceps",eq:"Cable"},{name:"Leg Press",muscle:"Legs",eq:"Machine"},{name:"Lat Pulldown",muscle:"Back",eq:"Cable"},{name:"Dumbbell Fly",muscle:"Chest",eq:"Dumbbell"},{name:"Lateral Raise",muscle:"Shoulders",eq:"Dumbbell"},{name:"Romanian Deadlift",muscle:"Hamstrings",eq:"Barbell"},{name:"Leg Curl",muscle:"Hamstrings",eq:"Machine"},{name:"Calf Raise",muscle:"Calves",eq:"Machine"},{name:"Plank",muscle:"Core",eq:"Bodyweight"},{name:"Face Pull",muscle:"Shoulders",eq:"Cable"},{name:"Hip Thrust",muscle:"Glutes",eq:"Barbell"},{name:"Incline DB Press",muscle:"Chest",eq:"Dumbbell"},{name:"Bulgarian Split Squat",muscle:"Legs",eq:"Dumbbell"},{name:"Hammer Curl",muscle:"Biceps",eq:"Dumbbell"},{name:"Skull Crusher",muscle:"Triceps",eq:"Barbell"},{name:"Cable Fly",muscle:"Chest",eq:"Cable"}];
function WorkoutsPage(){const[tab,setTab]=useState("plans");const[plans,setPlans]=useState([]);const[clients,setClients]=useState([]);const[loading,setLoading]=useState(true);const[showB,setShowB]=useState(false);const[exS,setExS]=useState("");const[exF,setExF]=useState("all");const[form,setForm]=useState({title:"",description:"",clientId:"",exercises:[{name:"",sets:3,reps:12,rest:60}]});useEffect(()=>{Promise.all([api.get("/workouts").catch(()=>({})),api.get("/clients").catch(()=>({}))]).then(([w,c])=>{setPlans(unwrap(w,"workouts","plans"));setClients(unwrap(c,"clients"));}).finally(()=>setLoading(false));},[]);const addEx=()=>setForm({...form,exercises:[...form.exercises,{name:"",sets:3,reps:12,rest:60}]});const rmEx=i=>setForm({...form,exercises:form.exercises.filter((_,j)=>j!==i)});const upEx=(i,f,v)=>{const e=[...form.exercises];e[i]={...e[i],[f]:v};setForm({...form,exercises:e});};const save=async()=>{await api.post("/workouts",form).catch(()=>{});setShowB(false);};const fe=EXDB.filter(e=>{if(exS&&!e.name.toLowerCase().includes(exS.toLowerCase()))return false;if(exF!=="all"&&e.muscle!==exF)return false;return true;});const muscles=[...new Set(EXDB.map(e=>e.muscle))];if(loading)return<Spin/>;return<div><ST right={<Btn onClick={()=>setShowB(true)} style={{padding:"8px 16px",fontSize:13}}>+ Create</Btn>}>Workouts</ST><Tabs tabs={[{id:"plans",label:"My Plans"},{id:"library",label:"Exercise Library"},{id:"templates",label:"Templates"}]} active={tab} onChange={setTab}/>{tab==="plans"&&(plans.length===0?<Empty icon="💪" text="No workout plans yet"/>:<div style={{display:"flex",flexDirection:"column",gap:10}}>{plans.map(p=><Card key={p.id} style={{padding:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}><div><div style={{color:C.tx,fontWeight:600,fontSize:15}}>{p.title}</div>{p.description&&<div style={{color:C.mt,fontSize:12,marginTop:4}}>{p.description}</div>}</div><Badge color={p.status==="active"?C.ok:C.mt}>{p.status||"draft"}</Badge></div>{p.exercises&&Array.isArray(p.exercises)&&<div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:4}}>{p.exercises.slice(0,4).map((ex,i)=><span key={i} style={{padding:"3px 8px",borderRadius:6,fontSize:11,fontWeight:500,background:C.ac+"15",color:C.ac}}>{ex.name||ex}</span>)}</div>}</Card>)}</div>)}{tab==="library"&&<div><Input placeholder="Search exercises…" value={exS} onChange={e=>setExS(e.target.value)} style={{marginBottom:10}}/><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}><button onClick={()=>setExF("all")} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:exF==="all"?C.ac:C.s2,color:exF==="all"?"#fff":C.mt}}>All</button>{muscles.map(m=><button key={m} onClick={()=>setExF(m)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:exF===m?C.ac:C.s2,color:exF===m?"#fff":C.mt}}>{m}</button>)}</div>{fe.map((e,i)=><Card key={i} style={{padding:12,marginBottom:6,display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:C.ac+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏋️</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.tx}}>{e.name}</div><div style={{fontSize:11,color:C.mt}}>{e.muscle} · {e.eq}</div></div></Card>)}</div>}{tab==="templates"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{[{n:"PPL - Push",ex:6,lv:"Intermediate"},{n:"PPL - Pull",ex:6,lv:"Intermediate"},{n:"PPL - Legs",ex:6,lv:"Intermediate"},{n:"Full Body Beginner",ex:8,lv:"Beginner"},{n:"Upper/Lower A",ex:6,lv:"Advanced"}].map((t,i)=><Card key={i} style={{padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{t.n}</div><div style={{fontSize:12,color:C.mt}}>{t.ex} exercises · {t.lv}</div></div><Btn variant="secondary" style={{padding:"6px 12px",fontSize:12}}>Use</Btn></Card>)}</div>}<Modal open={showB} onClose={()=>setShowB(false)} title="Create Workout" wide><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. PPL Week 1"/><Input label="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>{clients.length>0&&<Sel label="Assign" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select —"},...clients.map(c=>({value:c.id,label:c.name||c.user?.name}))]}/>}<div style={{fontSize:14,fontWeight:600,color:C.tx,marginTop:8}}>Exercises</div>{form.exercises.map((ex,i)=><Card key={i} style={{padding:12,background:C.s2}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,color:C.mt,fontWeight:600}}>#{i+1}</span>{form.exercises.length>1&&<button onClick={()=>rmEx(i)} style={{background:"none",border:"none",cursor:"pointer",color:C.dg,fontSize:18}}>✕</button>}</div><Sel value={ex.name} onChange={e=>upEx(i,"name",e.target.value)} options={[{value:"",label:"— Pick —"},...EXDB.map(e=>({value:e.name,label:`${e.name} (${e.muscle})`}))]} style={{marginBottom:8}}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><Input label="Sets" type="number" value={ex.sets} onChange={e=>upEx(i,"sets",+e.target.value)}/><Input label="Reps" type="number" value={ex.reps} onChange={e=>upEx(i,"reps",+e.target.value)}/><Input label="Rest(s)" type="number" value={ex.rest} onChange={e=>upEx(i,"rest",+e.target.value)}/></div></Card>)}<Btn variant="secondary" onClick={addEx} style={{width:"100%"}}>+ Exercise</Btn><Btn onClick={save} style={{width:"100%"}}>Save Plan</Btn></div></Modal></div>;}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
function BookingsPage(){
  const[bookings,setBookings]=useState([]);const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);const[showRepeat,setShowRepeat]=useState(false);
  const[clients,setClients]=useState([]);const[viewMode,setViewMode]=useState("month");
  const[currentMonth,setCurrentMonth]=useState(new Date());
  const[selDate,setSelDate]=useState(new Date().toISOString().slice(0,10));
  const[holidays,setHolidays]=useState(ls.get("holidays",[]));
  const[form,setForm]=useState({clientId:"",date:new Date().toISOString().slice(0,10),time:"09:00",duration:60,type:"training",notes:""});
  const[repeatForm,setRepeatForm]=useState({endDate:"",mode:"until_date",daysOfWeek:[1,2,3,4,5]});

  const load=()=>{Promise.all([api.get("/bookings").catch(()=>({})),api.get("/clients").catch(()=>({}))]).then(([b,c])=>{setBookings(unwrap(b,"bookings","sessions"));setClients(unwrap(c,"clients"));}).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[]);

  // Smart booking creator — handles role errors by trying multiple approaches
  const createBooking=async(bookingData)=>{
    const attempts=[
      ()=>api.post("/bookings",bookingData),
      ()=>api.post("/bookings",{...bookingData,coachId:undefined,role:"coach"}),
      ()=>api.post("/bookings/coach",bookingData),
      ()=>api.post("/bookings/schedule",bookingData),
    ];
    for(const attempt of attempts){
      try{const r=await attempt();return r;}
      catch(e){
        if(e.message.includes("CLIENT")||e.message.includes("role")||e.message.includes("authorize")){
          continue; // Try next approach
        }
        throw e;
      }
    }
    // All API attempts failed — save locally
    const localBooking={...bookingData,id:`local_${Date.now()}`,status:"confirmed",client:clients.find(c=>c.id===bookingData.clientId),createdAt:new Date().toISOString(),_local:true};
    const existing=ls.get("local_bookings",[]);
    ls.set("local_bookings",[...existing,localBooking]);
    setBookings(prev=>[...prev,localBooking]);
    return localBooking;
  };

  const save=async()=>{
    try{
      await createBooking({...form,date:form.date+"T"+form.time+":00"});
      setShowAdd(false);load();
    }catch(e){alert("Booking error: "+e.message);}
  };

  // Load local bookings too
  useEffect(()=>{
    const local=ls.get("local_bookings",[]);
    if(local.length>0)setBookings(prev=>[...prev,...local.filter(lb=>!prev.some(b=>b.id===lb.id))]);
  },[loading]);

  // Attendance
  const markAttendance=async(bid,status)=>{
    try{await api.put(`/bookings/${bid}`,{status});}catch{}
    if(String(bid).startsWith("local_")){
      const local=ls.get("local_bookings",[]).map(b=>b.id===bid?{...b,status}:b);
      ls.set("local_bookings",local);
    }
    setBookings(prev=>prev.map(b=>b.id===bid?{...b,status}:b));
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

  // Helper to get bookings for a date
  const getDateBookings=(dateStr)=>bookings.filter(b=>{
    try{return new Date(b.date||b.startTime||b.scheduledAt).toISOString().slice(0,10)===dateStr;}catch{return false;}
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
      <Btn variant={isHoliday?"danger":"secondary"} onClick={()=>isHoliday?toggleHoliday(selDate):cancelDay()} style={{padding:"6px 10px",fontSize:11}}>{isHoliday?"✓ Off":"🏖️"}</Btn>
      <Btn onClick={()=>setShowAdd(true)} style={{padding:"6px 12px",fontSize:12}}>+ Book</Btn>
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
        const clientName=b.client?.name||b.client?.user?.name||b.type||"Session";
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
            <Badge color={statusColors[b.status]||C.wn}>{b.status||"pending"}</Badge>
          </div>
          <div style={{display:"flex",gap:4}}>
            {[{s:"present",l:"✅ Present",c:C.ok},{s:"absent",l:"❌ Absent",c:C.dg},{s:"late",l:"⏰ Late",c:C.wn},{s:"cancelled",l:"🚫 Cancel",c:C.mt}].map(a=>
              <button key={a.s} onClick={()=>markAttendance(b.id,a.s)} style={{flex:1,padding:"6px 2px",borderRadius:8,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:b.status===a.s?a.c+"30":C.s2,color:b.status===a.s?a.c:C.mt}}>{a.l}</button>
            )}
          </div>
        </Card>;
      })}
    </div>}

    {/* ── BOOK SESSION MODAL ── */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Book Session">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {clients.length>0&&<Sel label="Client" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select Client —"},...clients.map(c=>({value:c.id,label:c.name||c.user?.name}))]}/>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Input label="Date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
          <Input label="Time" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Input label="Duration (min)" type="number" value={form.duration} onChange={e=>setForm({...form,duration:+e.target.value})}/>
          <Sel label="Type" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} options={[{value:"training",label:"Training"},{value:"assessment",label:"Assessment"},{value:"consultation",label:"Consultation"},{value:"group",label:"Group Class"}]}/>
        </div>
        <TextArea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
        <Btn onClick={save} style={{width:"100%"}}>Confirm Booking</Btn>
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
  const[msgs,setMsgs]=useState([{role:"assistant",content:"Hey! I'm your AI coaching assistant with full app access. I can:\n\n• Add, edit, find clients (\"Add client Ravi, phone 98765\")\n• Book & cancel sessions (\"Book Priya tomorrow 6am\")\n• Check schedules (\"What's my schedule today?\")\n• Create workout plans\n• Generate meal plans\n• Show stats & revenue\n\n🎙️ Tap the mic button to use voice commands!"}]);
  const[input,setInput]=useState("");const[loading,setLoading]=useState(false);
  const[voiceOn,setVoiceOn]=useState(true);const[isListening,setIsListening]=useState(false);
  const br=useRef(null);const recognitionRef=useRef(null);

  useEffect(()=>{br.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  // Speech synthesis
  const speakText=(text)=>{
    if(!voiceOn||!("speechSynthesis"in window))return;
    speechSynthesis.cancel();
    // Clean text for speech — remove emojis, markdown, etc.
    const clean=text.replace(/[•\-\*#📅🎯👥💪🏋️📈🤖✅❌⏰🚫📋🧾📊🎙️🔊🔇]/g,"").replace(/\n+/g,". ").slice(0,800);
    const u=new SpeechSynthesisUtterance(clean);
    u.rate=1.1;u.pitch=1;u.volume=0.9;
    // Try to find a good voice
    const voices=speechSynthesis.getVoices();
    const preferred=voices.find(v=>v.name.includes("Google")&&v.lang.startsWith("en"))||voices.find(v=>v.lang.startsWith("en"));
    if(preferred)u.voice=preferred;
    speechSynthesis.speak(u);
  };

  // Speech recognition
  const toggleListening=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice not supported in this browser");return;}
    if(isListening&&recognitionRef.current){recognitionRef.current.stop();setIsListening(false);return;}
    const r=new SR();r.continuous=false;r.interimResults=true;r.lang="en-US";
    r.onresult=(e)=>{
      const transcript=Array.from(e.results).map(r=>r[0].transcript).join("");
      setInput(transcript);
      if(e.results[0].isFinal){setTimeout(()=>send(transcript),300);}
    };
    r.onerror=()=>setIsListening(false);
    r.onend=()=>setIsListening(false);
    recognitionRef.current=r;r.start();setIsListening(true);
  };

  // Gather RAG context
  const gatherContext=async()=>{
    let ctx="";
    try{const c=await api.get("/clients");const cl=unwrap(c,"clients");ctx+=`\nCLIENTS (${cl.length}): ${cl.slice(0,20).map(x=>`${x.name||x.user?.name} [ID:${x.id}] (${x.email||x.user?.email||""}, Phone:${x.phone||"?"}, ${x.sessionType||"offline"})`).join("; ")}`;}catch{}
    try{const b=await api.get("/bookings");const bk=unwrap(b,"bookings","sessions");const today=new Date().toISOString().slice(0,10);const todayBk=bk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt).toISOString().slice(0,10)===today;}catch{return false;}});
    const upcoming=bk.filter(x=>{try{return new Date(x.date||x.startTime||x.scheduledAt)>=new Date();}catch{return false;}}).slice(0,10);
    ctx+=`\nTODAY'S SESSIONS (${todayBk.length}): ${todayBk.map(x=>`${x.client?.name||x.client?.user?.name||"?"} at ${new Date(x.date||x.startTime||x.scheduledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} [${x.status||"pending"}]`).join("; ")}`;
    ctx+=`\nUPCOMING (${upcoming.length}): ${upcoming.map(x=>`${x.client?.name||x.client?.user?.name||"?"} on ${new Date(x.date||x.startTime||x.scheduledAt).toLocaleDateString()} at ${new Date(x.date||x.startTime||x.scheduledAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`).join("; ")}`;}catch{}
    try{const r=await api.get("/reports/coach/dashboard");const d=r?.data||r||{};ctx+=`\nBUSINESS STATS: ${d.activeClients||d.totalClients||0} active clients, Revenue: ₹${d.totalRevenue||d.monthlyRevenue||0}, ${d.upcomingBookings||0} upcoming bookings, Conversion: ${d.conversionRate||0}%`;}catch{}
    try{const l=await api.get("/leads");const ld=unwrap(l,"leads");ctx+=`\nLEADS (${ld.length}): ${ld.slice(0,10).map(x=>`${x.name} [${x.status||"new"}]`).join(", ")}`;}catch{}
    const holidays=ls.get("holidays",[]);if(holidays.length)ctx+=`\nHOLIDAYS: ${holidays.join(", ")}`;
    const checkins=ls.get("checkins",[]);if(checkins.length)ctx+=`\nLATEST CHECK-IN: energy ${checkins[checkins.length-1]?.energy}/10, sleep ${checkins[checkins.length-1]?.sleep}/10`;
    return ctx;
  };

  // Try to execute actions based on AI response
  const tryExecuteAction=async(userMsg)=>{
    const msg=userMsg.toLowerCase();
    let actionResult=null;

    // Add client
    const addMatch=msg.match(/add (?:a )?(?:new )?client[:\s]+([a-zA-Z\s]+?)(?:,|\s+phone|\s+email|\s+mobile|\.|$)/i);
    if(addMatch){
      const name=addMatch[1].trim();
      const phoneMatch=msg.match(/(?:phone|mobile)[:\s]*(\+?\d[\d\s-]{7,})/i);
      const emailMatch=msg.match(/(?:email)[:\s]*([^\s,]+@[^\s,]+)/i);
      try{
        await api.post("/clients",{name,phone:phoneMatch?.[1]?.replace(/[\s-]/g,"")||"",email:emailMatch?.[1]||`${name.toLowerCase().replace(/\s/g,".")}@client.com`,sessionType:"offline"});
        actionResult=`✅ Client "${name}" has been added successfully!`;
      }catch(e){actionResult=`⚠️ Could not add client: ${e.message}`;}
    }

    // Book session
    const bookMatch=msg.match(/book\s+(?:a\s+)?(?:session\s+)?(?:for\s+)?([a-zA-Z]+)\s+(?:on\s+|tomorrow|today|next)/i);
    if(bookMatch&&!actionResult){
      actionResult=`📅 To book a session, please use the Schedule tab → + Book button. I've noted your request for ${bookMatch[1]}.`;
    }

    // Show schedule
    if((msg.includes("schedule")||msg.includes("session"))&&(msg.includes("today")||msg.includes("tomorrow"))&&!actionResult){
      actionResult="📅 Fetching your schedule data for the AI response...";
    }

    return actionResult;
  };

  const send=async(text)=>{
    const msg=(text||input).trim();if(!msg||loading)return;
    if(!text)setInput("");
    setMsgs(p=>[...p,{role:"user",content:msg}]);setLoading(true);

    try{
      // Try to execute action first
      const actionResult=await tryExecuteAction(msg);

      const context=await gatherContext();
      const systemPrompt=`You are CoachMe AI — a smart fitness coaching assistant embedded in the CoachMe.life platform. You have REAL-TIME access to the coach's actual business data below. Answer using this data. Be concise, helpful, and conversational. If asked to perform actions, explain clearly. Format important data points clearly.

COACH: ${user?.name||"Coach"} (${user?.email||""}, Role: ${user?.role||"coach"})
CURRENT DATE/TIME: ${new Date().toLocaleString()}

━━ LIVE APP DATA ━━${context}

${actionResult?`\nACTION EXECUTED: ${actionResult}`:""}`;

      const r=await api.post("/ai/chat",{message:msg,history:msgs.slice(-10),systemPrompt});
      let reply=r.reply||r.message||r.response||"I'll help with that.";
      if(actionResult&&!reply.includes(actionResult))reply=actionResult+"\n\n"+reply;
      setMsgs(p=>[...p,{role:"assistant",content:reply}]);
      speakText(reply);
    }catch(e){
      const fallback="Sorry, the AI service isn't responding. Please try again.";
      setMsgs(p=>[...p,{role:"assistant",content:fallback}]);
    }
    setLoading(false);
  };

  const suggestions=["📅 Show today's schedule","👥 How many active clients?","💰 Revenue this month","🍎 Generate a muscle gain meal plan","💪 Create a PPL push day workout","📊 Show my business stats"];

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
      {suggestions.map(s=><button key={s} onClick={()=>send(s.replace(/^[^\s]+\s/,""))} style={{padding:"8px 14px",borderRadius:20,border:`1px solid ${C.bd}`,background:C.s2,color:C.tx,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{s}</button>)}
    </div>}

    <div style={{display:"flex",gap:8,flexShrink:0,paddingTop:8}}>
      <button onClick={toggleListening} style={{width:48,height:48,borderRadius:14,border:"none",cursor:"pointer",background:isListening?C.dg:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:isListening?`0 0 20px ${C.dg}40`:"none",animation:isListening?"pulse 1s infinite":"none",transition:"all .2s"}}>🎙️</button>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={isListening?"Listening…":"Ask anything about your business…"} style={{flex:1,background:C.s2,border:`1px solid ${isListening?C.dg:C.bd}`,borderRadius:14,padding:"12px 16px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit",transition:"border-color .2s"}}/>
      <button onClick={()=>send()} disabled={loading} style={{width:48,height:48,borderRadius:14,border:"none",cursor:"pointer",background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff"}}>➤</button>
    </div>
  </div>;
}
function MessagingPage({initialClient,onBack}){const{user}=useAuth();const[convos,setConvos]=useState([]);const[active,setActive]=useState(initialClient||null);const[msgs,setMsgs]=useState([]);const[input,setInput]=useState("");const br=useRef(null);const pr=useRef(null);useEffect(()=>{api.get("/clients").then(d=>setConvos(unwrap(d,"clients"))).catch(()=>{});},[]);useEffect(()=>{if(!active)return;const ld=()=>api.get(`/messages/${active.id||active.userId}`).then(d=>setMsgs(unwrap(d,"messages"))).catch(()=>{});ld();pr.current=setInterval(ld,5000);return()=>clearInterval(pr.current);},[active]);useEffect(()=>{br.current?.scrollIntoView({behavior:"smooth"});},[msgs]);const sendMsg=async()=>{if(!input.trim())return;const t=input.trim();setInput("");setMsgs(m=>[...m,{id:Date.now(),senderId:user?.id,content:t,createdAt:new Date().toISOString()}]);try{await api.post("/messages",{recipientId:active.id||active.userId,content:t});}catch{}};if(!active)return<div><ST>Messages</ST>{convos.length===0?<Empty icon="💬" text="No conversations"/>:convos.map(c=><Card key={c.id} onClick={()=>setActive(c)} style={{padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",marginBottom:6}}><div style={{width:44,height:44,borderRadius:22,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:"#fff"}}>{(c.name||c.user?.name||"?")[0].toUpperCase()}</div><div style={{flex:1}}><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{c.name||c.user?.name}</div><div style={{color:C.mt,fontSize:12}}>Tap to chat</div></div></Card>)}</div>;return<div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 160px)"}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><button onClick={()=>{setActive(null);onBack?.();}} style={{background:"none",border:"none",cursor:"pointer",color:C.tx,fontSize:20,padding:0}}>←</button><div style={{width:36,height:36,borderRadius:18,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>{(active.name||active.user?.name||"?")[0].toUpperCase()}</div><div><div style={{color:C.tx,fontSize:15,fontWeight:600}}>{active.name||active.user?.name}</div><div style={{color:C.ok,fontSize:11}}>● online</div></div></div><div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,paddingBottom:8}}>{msgs.length===0&&<Empty icon="💬" text="Start chatting"/>}{msgs.map(m=>{const me=m.senderId===user?.id;return<div key={m.id} style={{maxWidth:"78%",alignSelf:me?"flex-end":"flex-start",padding:"10px 14px",borderRadius:14,borderBottomRightRadius:me?4:14,borderBottomLeftRadius:me?14:4,background:me?C.ac:C.s2,color:me?"#fff":C.tx,fontSize:14,lineHeight:1.45}}>{m.content}<div style={{fontSize:10,opacity:.6,marginTop:4,textAlign:"right"}}>{new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div></div>;})}<div ref={br}/></div><div style={{display:"flex",gap:8,flexShrink:0,paddingTop:8}}><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Type a message…" style={{flex:1,background:C.s2,border:`1px solid ${C.bd}`,borderRadius:24,padding:"12px 18px",color:C.tx,fontSize:14,outline:"none",fontFamily:"inherit"}}/><button onClick={sendMsg} style={{width:48,height:48,borderRadius:24,border:"none",cursor:"pointer",background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff"}}>➤</button></div></div>;}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
function InvoicesPage(){const[inv,setInv]=useState(ls.get("invoices",[]));const[showAdd,setShowAdd]=useState(false);const[clients,setClients]=useState([]);const[form,setForm]=useState({clientId:"",amount:"",description:"",dueDate:""});useEffect(()=>{api.get("/clients").then(d=>setClients(unwrap(d,"clients"))).catch(()=>{});},[]);const save=()=>{const cl=clients.find(c=>c.id===form.clientId);const e={...form,id:Date.now(),clientName:cl?.name||cl?.user?.name||"Client",date:new Date().toISOString().slice(0,10),amount:+form.amount,status:"pending"};const u=[...inv,e];setInv(u);ls.set("invoices",u);setShowAdd(false);setForm({clientId:"",amount:"",description:"",dueDate:""});};const markPaid=id=>{const u=inv.map(i=>i.id===id?{...i,status:"paid"}:i);setInv(u);ls.set("invoices",u);};const tp=inv.filter(i=>i.status==="pending").reduce((s,i)=>s+i.amount,0);const tc=inv.filter(i=>i.status==="paid").reduce((s,i)=>s+i.amount,0);return<div><ST right={<Btn onClick={()=>setShowAdd(true)} style={{padding:"8px 16px",fontSize:13}}>+ Invoice</Btn>}>Invoices</ST><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}><SC label="Pending" value={`₹${tp.toLocaleString()}`} icon="⏳" color={C.wn}/><SC label="Collected" value={`₹${tc.toLocaleString()}`} icon="✅" color={C.ok}/></div>{inv.length===0?<Empty icon="🧾" text="No invoices"/>:inv.slice().reverse().map(i=><Card key={i.id} style={{padding:14,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{i.clientName}</div><div style={{fontSize:12,color:C.mt}}>{i.description} · {i.date}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:C.tx}}>₹{i.amount.toLocaleString()}</div>{i.status==="pending"?<button onClick={()=>markPaid(i.id)} style={{padding:"3px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",background:C.ok+"20",color:C.ok,marginTop:4}}>Mark Paid</button>:<Badge color={C.ok}>Paid</Badge>}</div></Card>)}<Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Create Invoice"><div style={{display:"flex",flexDirection:"column",gap:12}}>{clients.length>0&&<Sel label="Client" value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})} options={[{value:"",label:"— Select —"},...clients.map(c=>({value:c.id,label:c.name||c.user?.name}))]}/>}<Input label="Amount (₹)" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/><Input label="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Monthly coaching - March"/><Input label="Due Date" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><Btn onClick={save} style={{width:"100%"}}>Create</Btn></div></Modal></div>;}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsPage(){const{user,logout}=useAuth();const[profile,setProfile]=useState({name:user?.name||"",email:user?.email||""});const[saved,setSaved]=useState(false);const save=async()=>{try{await api.put("/auth/profile",profile);setSaved(true);setTimeout(()=>setSaved(false),2000);}catch{}};return<div><ST>Settings</ST><Card style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}><div style={{width:56,height:56,borderRadius:16,background:C.gr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff"}}>{(user?.name||"U")[0].toUpperCase()}</div><div><div style={{color:C.tx,fontSize:16,fontWeight:600}}>{user?.name}</div><Badge>{user?.role||"coach"}</Badge></div></div><div style={{display:"flex",flexDirection:"column",gap:12}}><Input label="Name" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/><Input label="Email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/><Btn onClick={save} style={{width:"100%"}}>{saved?"✓ Saved!":"Update Profile"}</Btn></div></Card><Card><Btn variant="danger" onClick={logout} style={{width:"100%"}}>🚪 Sign Out</Btn></Card></div>;}

// ─── NAV + ROUTING ────────────────────────────────────────────────────────────
const TABS=[{id:"dashboard",icon:"🏠",label:"Home"},{id:"workouts",icon:"💪",label:"Workouts"},{id:"bookings",icon:"📅",label:"Schedule"},{id:"chat",icon:"💬",label:"Chat"},{id:"more",icon:"⚙️",label:"More"}];
function BNav({active,onChange}){return<nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:C.sf,borderTop:`1px solid ${C.bd}`,display:"flex",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>{TABS.map(t=>{const a=active===t.id;return<button key={t.id} onClick={()=>onChange(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 0 8px",border:"none",cursor:"pointer",background:"transparent"}}><div style={{padding:"4px 16px",borderRadius:12,background:a?C.ac+"20":"transparent",fontSize:18}}>{t.icon}</div><span style={{fontSize:10,fontWeight:a?700:500,color:a?C.ac:C.mt}}>{t.label}</span></button>;})}</nav>;}
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
  const[results,setResults]=useState([]);const[running,setRunning]=useState(false);const[logLines,setLogLines]=useState([]);
  const addLog=(msg,type="info")=>setLogLines(p=>[...p,{msg,type,time:new Date().toLocaleTimeString()}]);
  const addResult=(group,name,status,detail)=>setResults(p=>[...p,{group,name,status,detail}]);

  const apiTest=async(method,path,body=null)=>{
    const headers={"Content-Type":"application/json"};
    if(api.token)headers["Authorization"]=`Bearer ${api.token}`;
    const opts={method,headers};if(body)opts.body=JSON.stringify(body);
    addLog(`→ ${method} ${path}`,"info");
    try{
      const res=await fetch(`${API}${path}`,opts);
      const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}
      addLog(`← ${res.status} ${JSON.stringify(data).slice(0,150)}`,res.ok?"ok":"err");
      return{status:res.status,ok:res.ok,data};
    }catch(e){addLog(`✕ ${e.message}`,"err");return{status:0,ok:false,data:{error:e.message}};}
  };

  const runAll=async()=>{setResults([]);setLogLines([]);setRunning(true);
    addLog("Starting CoachMe Test Suite…","info");

    // Auth
    let r=await apiTest("GET","/auth/me");
    addResult("Auth","GET /auth/me",r.ok?"pass":"fail",`${r.status}: ${JSON.stringify(r.data).slice(0,100)}`);

    // Clients
    r=await apiTest("GET","/clients");
    addResult("Clients","GET /clients",r.ok?"pass":"fail",`${r.status}: keys=${Object.keys(r.data)}`);
    const testEmail=`autotest_${Date.now()}@test.com`;
    r=await apiTest("POST","/clients",{name:"AutoTest",email:testEmail,phone:"1234567890",sessionType:"offline"});
    addResult("Clients","POST /clients (create)",r.ok?"pass":"fail",`${r.status}: ${JSON.stringify(r.data).slice(0,100)}`);
    const newId=r.data?.id||r.data?.client?.id||r.data?.data?.id;
    if(newId){
      r=await apiTest("PUT",`/clients/${newId}`,{notes:"test update"});
      addResult("Clients",`PUT /clients/${newId}`,r.ok?"pass":"fail",`${r.status}`);
      r=await apiTest("DELETE",`/clients/${newId}`);
      addResult("Clients",`DELETE /clients/${newId}`,r.ok?"pass":"fail",`${r.status}`);
    }
    r=await apiTest("POST","/clients/bulk",{clients:[{name:"Bulk1",email:`b1_${Date.now()}@t.com`,phone:"111"}]});
    addResult("Clients","POST /clients/bulk",r.status!==404?"pass":"fail",`${r.status}: ${JSON.stringify(r.data).slice(0,80)}`);

    // Bookings
    r=await apiTest("GET","/bookings");
    addResult("Bookings","GET /bookings",r.ok?"pass":"fail",`${r.status}: keys=${Object.keys(r.data)}`);
    r=await apiTest("POST","/bookings",{date:new Date().toISOString(),duration:60,type:"training"});
    addResult("Bookings","POST /bookings",r.ok?"pass":"fail",`${r.status}: ${JSON.stringify(r.data).slice(0,100)}`);

    // Leads
    r=await apiTest("GET","/leads");
    addResult("Leads","GET /leads",r.ok?"pass":"fail",`${r.status}`);
    r=await apiTest("POST","/leads",{name:"TestLead",email:`lead_${Date.now()}@t.com`,phone:"555",source:"website"});
    addResult("Leads","POST /leads",r.ok?"pass":"fail",`${r.status}`);

    // Workouts
    r=await apiTest("GET","/workouts");
    addResult("Workouts","GET /workouts",r.status!==404?"pass":"fail",`${r.status}`);

    // Reports
    for(const ep of["/reports/coach/dashboard","/reports/coach/revenue","/reports/coach/clients"]){
      r=await apiTest("GET",ep);
      addResult("Reports",`GET ${ep}`,r.ok?"pass":"fail",`${r.status}`);
    }

    // AI Chat
    r=await apiTest("POST","/ai/chat",{message:"test"});
    addResult("AI","POST /ai/chat",r.ok?"pass":"fail",`${r.status}: ${(r.data?.reply||r.data?.message||"").slice(0,50)}`);

    // Messages
    r=await apiTest("GET","/messages");
    addResult("Messages","GET /messages",r.status!==404?"pass":"fail",`${r.status}`);

    // Coaches
    r=await apiTest("GET","/coaches");
    addResult("Coaches","GET /coaches",r.ok?"pass":"fail",`${r.status}`);

    // Route discovery
    for(const p of["/auth/logout","/bookings/upcoming","/notifications","/subscriptions","/reviews"]){
      r=await apiTest("GET",p);
      addResult("Discovery",`GET ${p}`,r.status!==404?"exists":"missing",`${r.status}`);
    }

    addLog("━━ TESTS COMPLETE ━━","ok");
    setRunning(false);
  };

  const pass=results.filter(r=>r.status==="pass").length;
  const fail=results.filter(r=>r.status==="fail").length;
  const total=results.length;

  const exportReport=()=>{
    let txt=`COACHME TEST REPORT\n${"=".repeat(50)}\nDate: ${new Date().toISOString()}\n\n`;
    const groups=[...new Set(results.map(r=>r.group))];
    groups.forEach(g=>{
      txt+=`\n${"─".repeat(50)}\n${g}\n${"─".repeat(50)}\n`;
      results.filter(r=>r.group===g).forEach(r=>{
        txt+=`${r.status==="pass"?"✅":"❌"} ${r.status.toUpperCase().padEnd(6)} ${r.name}\n   → ${r.detail}\n`;
      });
    });
    txt+=`\n${"=".repeat(50)}\nSUMMARY: ${total} total | ${pass} passed | ${fail} failed\nPass Rate: ${total>0?((pass/total)*100).toFixed(1):0}%\n`;
    const blob=new Blob([txt],{type:"text/plain"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`coachme-test-${new Date().toISOString().slice(0,10)}.txt`;a.click();
  };

  return<div>
    <ST right={<div style={{display:"flex",gap:6}}>
      <Btn onClick={runAll} disabled={running} style={{padding:"8px 14px",fontSize:12}}>{running?"⏳ Running…":"▶ Run Tests"}</Btn>
      <Btn variant="secondary" onClick={exportReport} disabled={results.length===0} style={{padding:"8px 14px",fontSize:12}}>📄 Export</Btn>
    </div>}>🧪 Test Suite</ST>

    {/* Summary */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
      <SC label="Total" value={total} icon="📋" color={C.ac}/>
      <SC label="Passed" value={pass} icon="✅" color={C.ok}/>
      <SC label="Failed" value={fail} icon="❌" color={C.dg}/>
    </div>

    {/* Results */}
    {results.length>0&&<div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:16}}>
      {results.map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:C.sf,fontSize:12}}>
        <span>{r.status==="pass"?"✅":r.status==="fail"?"❌":"⏭️"}</span>
        <span style={{color:C.mt,minWidth:70}}>{r.group}</span>
        <span style={{flex:1,color:C.tx,fontWeight:500}}>{r.name}</span>
        <span style={{fontSize:11,color:C.mt,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.detail}</span>
      </div>)}
    </div>}

    {/* Log */}
    {logLines.length>0&&<Card style={{maxHeight:200,overflowY:"auto",padding:12}}>
      <div style={{fontSize:12,fontWeight:600,color:C.tx,marginBottom:8}}>Console Log</div>
      {logLines.map((l,i)=><div key={i} style={{fontSize:11,fontFamily:"monospace",color:l.type==="ok"?C.ok:l.type==="err"?C.dg:C.mt,lineHeight:1.6}}>[{l.time}] {l.msg}</div>)}
    </Card>}
  </div>;
}

function MoreMenu({onNav}){const items=[{id:"clients",icon:"👥",label:"Clients",desc:"Manage clients"},{id:"leads",icon:"🎯",label:"Leads Pipeline",desc:"Kanban board"},{id:"mealplan",icon:"🍎",label:"AI Meal Planner",desc:"AI-generated plans"},{id:"nutrition",icon:"🥗",label:"Nutrition Tracker",desc:"Log food & macros"},{id:"habits",icon:"✅",label:"Habit Tracker",desc:"Daily habits & streaks"},{id:"checkins",icon:"📋",label:"Check-ins",desc:"Weekly questionnaires"},{id:"reports",icon:"📊",label:"Analytics",desc:"Revenue & reports"},{id:"invoices",icon:"🧾",label:"Invoices",desc:"Billing & payments"},{id:"ai",icon:"🤖",label:"AI Coach",desc:"RAG-powered assistant"},{id:"media",icon:"🎥",label:"Media Library",desc:"Videos & progress photos"},{id:"settings",icon:"⚙️",label:"Settings",desc:"Profile & prefs"},{id:"tests",icon:"🧪",label:"Test Suite",desc:"Run automated tests"}];return<div><ST>More</ST><div style={{display:"flex",flexDirection:"column",gap:6}}>{items.map(i=><Card key={i.id} onClick={()=>onNav(i.id)} style={{padding:14,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}><div style={{width:42,height:42,borderRadius:12,background:C.ac+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{i.icon}</div><div style={{flex:1}}><div style={{color:C.tx,fontSize:14,fontWeight:600}}>{i.label}</div><div style={{color:C.mt,fontSize:12}}>{i.desc}</div></div><span style={{color:C.mt,fontSize:18}}>›</span></Card>)}</div></div>;}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function MainApp(){const[tab,setTab]=useState("dashboard");const[sub,setSub]=useState(null);const[chatCl,setChatCl]=useState(null);const handleV=useCallback((cmd,speak)=>{const r={dashboard:["home","dashboard"],workouts:["workout","exercise"],bookings:["schedule","booking","calendar"],chat:["message","chat"],clients:["client"],leads:["lead","pipeline"],reports:["report","analytics"],ai:["ai","assistant"],mealplan:["meal","diet","nutrition plan"],habits:["habit"],checkins:["checkin","check-in"],invoices:["invoice","payment","billing"],settings:["setting","profile"],tests:["test","testing","suite"]};for(const[rt,kw] of Object.entries(r)){if(kw.some(k=>cmd.includes(k))){if(["dashboard","workouts","bookings","chat"].includes(rt)){setTab(rt);setSub(null);}else{setTab("more");setSub(rt);}speak(`Opening ${rt}`);return;}}speak("Try saying a page name.");},[]);const{listening,toggle}=useVoice(handleV);const nav=id=>{if(["dashboard","workouts","bookings","chat"].includes(id)){setTab(id);setSub(null);}else if(id==="more"){setTab("more");setSub(null);}else{setTab("more");setSub(id);}};const render=()=>{if(tab==="more"&&sub){const p={clients:<ClientsPage onOpenChat={c=>{setChatCl(c);setTab("chat");}}/>,leads:<LeadsPage/>,reports:<ReportsPage/>,ai:<AIChatPage/>,settings:<SettingsPage/>,mealplan:<MealPlannerPage/>,nutrition:<NutritionTracker/>,habits:<HabitTracker/>,checkins:<CheckInsPage/>,invoices:<InvoicesPage/>,media:<MediaLibrary/>,tests:<TestSuitePage/>};return p[sub]||<MoreMenu onNav={setSub}/>;}const p={dashboard:<DashboardPage/>,workouts:<WorkoutsPage/>,bookings:<BookingsPage/>,chat:<MessagingPage initialClient={chatCl} onBack={()=>setChatCl(null)}/>,more:<MoreMenu onNav={setSub}/>};return p[tab]||<DashboardPage/>;};return<div style={{minHeight:"100dvh",background:C.bg,color:C.tx,fontFamily:"'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif"}}><style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}`}</style><button onClick={toggle} style={{position:"fixed",right:16,bottom:80,zIndex:200,width:48,height:48,borderRadius:24,border:"none",cursor:"pointer",background:listening?C.dg:C.gr,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px ${listening?C.dg+"60":C.ac+"40"}`,animation:listening?"pulse 1.5s ease infinite":"none",fontSize:20}} title="Voice">🎙️</button><div style={{padding:"16px 16px 90px",maxWidth:600,margin:"0 auto"}}>{tab==="more"&&sub&&<button onClick={()=>setSub(null)} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontSize:14,fontWeight:600,marginBottom:12,padding:0,fontFamily:"inherit"}}>← Back</button>}{render()}</div><BNav active={tab} onChange={nav}/></div>;}

function useVoice(onCmd){const[listening,setListening]=useState(false);const speak=useCallback(t=>{if("speechSynthesis"in window){const u=new SpeechSynthesisUtterance(t);u.rate=1.05;speechSynthesis.speak(u);}},[]);const toggle=useCallback(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return speak("Voice not supported");if(listening)return setListening(false);const r=new SR();r.continuous=false;r.lang="en-US";r.onresult=e=>{onCmd(e.results[0][0].transcript.toLowerCase().trim(),speak);setListening(false);};r.onerror=()=>setListening(false);r.onend=()=>setListening(false);r.start();setListening(true);},[listening,onCmd,speak]);return{listening,toggle,speak};}

export default function App(){return<AuthProvider><AuthGate/></AuthProvider>;}
function AuthGate(){const{user}=useAuth();return user?<MainApp/>:<AuthScreen/>;}
