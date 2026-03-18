import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, where } from "firebase/firestore";

const emptyEntry = () => ({
  date: new Date().toISOString().slice(0, 10),
  project: "",
  start: "07:00",
  end: "15:00",
  breakMinutes: 30,
  travelHours: 0,
  km: 0,
  allowanceType: "ingen",
  note: "",
});

function parseTime(value) {
  if (!value || !value.includes(":")) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function calcWorkHours(start, end, breakMinutes) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return 0;
  let minutes = e - s;
  if (minutes < 0) minutes += 24 * 60;
  minutes -= Number(breakMinutes || 0);
  return Math.max(0, minutes / 60);
}
const calcOt50 = (hours) => Math.max(0, Math.min(hours - 8, 2));
const calcOt100 = (hours) => Math.max(0, hours - 10);
const calcAllowance = (type) => type === "halv" ? 28 : type === "hel" ? 53 : 0;
const allowanceLabel = (type) => type === "halv" ? "Partiell" : type === "hel" ? "Hel" : "Ingen";
const monthKey = (dateString) => (dateString || "").slice(0, 7);

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [draft, setDraft] = useState(emptyEntry());
  const [activeView, setActiveView] = useState("rapportera");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setProfile(null); setEntries([]); setWorkers([]); setLoading(false); return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.exists() ? { id: snap.id, ...snap.data() } : { id: user.uid, name: user.email, email: user.email, role: "worker" };
      setProfile(data);
      if (data.role !== "admin") setSelectedWorkerId(user.uid);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;
    const unsub = onSnapshot(query(collection(db, "users"), where("role", "==", "worker")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWorkers(rows);
      if (!selectedWorkerId && rows[0]?.id) setSelectedWorkerId(rows[0].id);
    });
    return () => unsub();
  }, [profile, selectedWorkerId]);

  useEffect(() => {
    if (!profile) return;
    const workerId = profile.role === "admin" ? selectedWorkerId : authUser?.uid;
    if (!workerId) return;
    const q = query(collection(db, "entries"), where("workerId", "==", workerId), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [profile, selectedWorkerId, authUser]);

  const computedEntries = useMemo(() => entries.map((entry) => {
    const workHours = calcWorkHours(entry.start, entry.end, entry.breakMinutes);
    const ot50 = calcOt50(workHours);
    const ot100 = calcOt100(workHours);
    const allowanceAmount = calcAllowance(entry.allowanceType);
    return { ...entry, workHours, ot50, ot100, allowanceAmount };
  }), [entries]);

  const totals = useMemo(() => computedEntries.reduce((acc, row) => {
    acc.workHours += row.workHours;
    acc.ot50 += row.ot50;
    acc.ot100 += row.ot100;
    acc.travelHours += Number(row.travelHours || 0);
    acc.km += Number(row.km || 0);
    acc.allowanceAmount += Number(row.allowanceAmount || 0);
    return acc;
  }, { workHours: 0, ot50: 0, ot100: 0, travelHours: 0, km: 0, allowanceAmount: 0 }), [computedEntries]);

  const monthly = useMemo(() => {
    const groups = {};
    for (const row of computedEntries) {
      const key = monthKey(row.date);
      if (!groups[key]) groups[key] = { workHours: 0, ot50: 0, ot100: 0, travelHours: 0, km: 0, allowanceAmount: 0 };
      groups[key].workHours += row.workHours;
      groups[key].ot50 += row.ot50;
      groups[key].ot100 += row.ot100;
      groups[key].travelHours += Number(row.travelHours || 0);
      groups[key].km += Number(row.km || 0);
      groups[key].allowanceAmount += Number(row.allowanceAmount || 0);
    }
    return Object.entries(groups).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [computedEntries]);

  const handleLogin = async () => {
    try { setLoginError(""); await signInWithEmailAndPassword(auth, email, password); }
    catch { setLoginError("Kunde inte logga in. Kontrollera e-post och lösenord."); }
  };
  const handleLogout = async () => { await signOut(auth); setEmail(""); setPassword(""); };

  const addEntry = async () => {
    const workerId = profile?.role === "admin" ? selectedWorkerId : authUser?.uid;
    if (!workerId) return;
    await addDoc(collection(db, "entries"), {
      ...draft,
      workerId,
      workerName: profile?.role === "admin" ? (workers.find((w) => w.id === workerId)?.name || "") : (profile?.name || authUser?.email || ""),
      createdAt: serverTimestamp(),
    });
    setDraft({ ...emptyEntry(), project: draft.project });
    setSaveMessage("Rapport sparad i molnet");
    setActiveView("dagar");
    setTimeout(() => setSaveMessage(""), 1800);
  };

  const removeEntry = async (id) => { await deleteDoc(doc(db, "entries", id)); };

  const exportCsv = () => {
    const headers = ["Datum","Projekt","Start","Slut","Paus_min","Arbetstimmar","OT_50","OT_100","Restid_h","Km","Traktamente_typ","Traktamente_eur","Notering"];
    const rows = computedEntries.map((r) => [
      r.date, r.project, r.start, r.end, r.breakMinutes, r.workHours.toFixed(2), r.ot50.toFixed(2), r.ot100.toFixed(2),
      Number(r.travelHours || 0).toFixed(2), Number(r.km || 0), allowanceLabel(r.allowanceType), Number(r.allowanceAmount || 0).toFixed(2), (r.note || "").replaceAll(",", " ")
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "timrapport.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="center">Laddar...</div>;

  if (!authUser) {
    return <div className="page"><div className="container"><div className="card">
      <h1>Timrapport</h1>
      <p className="muted">Inloggning för arbetare och admin</p>
      <label>E-post</label><input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="namn@foretag.fi" />
      <label>Lösenord</label><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" />
      {loginError ? <div className="error">{loginError}</div> : null}
      <button className="primary" onClick={handleLogin}>Logga in</button>
      <p className="muted small">Skapa användare i Firebase Authentication och en profil i Firestore-samlingen users med rollen admin eller worker.</p>
    </div></div></div>;
  }

  return (
    <div className="page"><div className="container">
      <div className="card header">
        <div className="row between">
          <div>
            <h1>Timrapport</h1>
            <p className="muted">{profile?.role === "admin" ? "Adminvy" : "Arbetarvy"} · {profile?.name || authUser?.email}</p>
          </div>
          <button className="ghost" onClick={handleLogout}>Logga ut</button>
        </div>
        {profile?.role === "admin" ? <>
          <label>Välj arbetare</label>
          <select value={selectedWorkerId} onChange={(e)=>setSelectedWorkerId(e.target.value)}>
            <option value="">Välj arbetare</option>
            {workers.map((w)=><option key={w.id} value={w.id}>{w.name || w.email}</option>)}
          </select>
        </> : null}
        <p className="muted small">{saveMessage || "Data sparas i Firebase Firestore"}</p>
      </div>

      {activeView === "rapportera" && <div className="card">
        <h2>Ny dag</h2>
        <label>Datum</label><input type="date" value={draft.date} onChange={(e)=>setDraft({...draft, date:e.target.value})} />
        <label>Projekt / plats</label><input value={draft.project} onChange={(e)=>setDraft({...draft, project:e.target.value})} placeholder="Projekt eller plats" />
        <div className="grid2">
          <div><label>Start</label><input type="time" value={draft.start} onChange={(e)=>setDraft({...draft, start:e.target.value})} /></div>
          <div><label>Slut</label><input type="time" value={draft.end} onChange={(e)=>setDraft({...draft, end:e.target.value})} /></div>
        </div>
        <div className="grid3">
          <div><label>Paus min</label><input type="number" value={draft.breakMinutes} onChange={(e)=>setDraft({...draft, breakMinutes:e.target.value})} /></div>
          <div><label>Restid h</label><input type="number" step="0.25" value={draft.travelHours} onChange={(e)=>setDraft({...draft, travelHours:e.target.value})} /></div>
          <div><label>Km</label><input type="number" value={draft.km} onChange={(e)=>setDraft({...draft, km:e.target.value})} /></div>
        </div>
        <label>Traktamente</label>
        <select value={draft.allowanceType} onChange={(e)=>setDraft({...draft, allowanceType:e.target.value})}>
          <option value="ingen">Ingen</option><option value="halv">Partiell</option><option value="hel">Hel</option>
        </select>
        <label>Notering</label><input value={draft.note} onChange={(e)=>setDraft({...draft, note:e.target.value})} placeholder="Valfri kommentar" />
        <div className="summary-box">
          <div className="row between"><span>Arbetstimmar</span><strong>{calcWorkHours(draft.start, draft.end, draft.breakMinutes).toFixed(2)} h</strong></div>
          <div className="row between"><span>Övertid 50 %</span><strong>{calcOt50(calcWorkHours(draft.start, draft.end, draft.breakMinutes)).toFixed(2)} h</strong></div>
          <div className="row between"><span>Övertid 100 %</span><strong>{calcOt100(calcWorkHours(draft.start, draft.end, draft.breakMinutes)).toFixed(2)} h</strong></div>
          <div className="row between"><span>Traktamente</span><strong>{allowanceLabel(draft.allowanceType)} ({calcAllowance(draft.allowanceType).toFixed(2)} €)</strong></div>
        </div>
        <button className="primary" onClick={addEntry} disabled={profile?.role === "admin" && !selectedWorkerId}>Spara dag</button>
      </div>}

      {activeView === "dagar" && <div>
        {computedEntries.length === 0 ? <div className="card muted">Inga rapporter ännu.</div> : computedEntries.map((row) => (
          <div key={row.id} className="card">
            <div className="row between">
              <div><div><strong>{row.date}</strong></div><div className="muted small">{row.project || "Ingen plats angiven"}</div></div>
              <button className="ghost" onClick={()=>removeEntry(row.id)}>Ta bort</button>
            </div>
            <div className="grid2 mini">
              <div className="pill">Tid: <strong>{row.start}-{row.end}</strong></div>
              <div className="pill">Arbetstid: <strong>{row.workHours.toFixed(2)} h</strong></div>
              <div className="pill">ÖT 50 %: <strong>{row.ot50.toFixed(2)} h</strong></div>
              <div className="pill">ÖT 100 %: <strong>{row.ot100.toFixed(2)} h</strong></div>
              <div className="pill">Restid: <strong>{Number(row.travelHours || 0).toFixed(2)} h</strong></div>
              <div className="pill">Km: <strong>{Number(row.km || 0)}</strong></div>
            </div>
            <div className="allowance">Traktamente: <strong>{allowanceLabel(row.allowanceType)}</strong> · {row.allowanceAmount.toFixed(2)} €</div>
            {row.note ? <div className="muted small">{row.note}</div> : null}
          </div>
        ))}
      </div>}

      {activeView === "summering" && <div>
        <div className="grid2">
          <div className="card stat"><div className="muted small">Totalt arbete</div><div className="big">{totals.workHours.toFixed(2)} h</div></div>
          <div className="card stat"><div className="muted small">Restid</div><div className="big">{totals.travelHours.toFixed(2)} h</div></div>
          <div className="card stat"><div className="muted small">ÖT 50 %</div><div className="big">{totals.ot50.toFixed(2)} h</div></div>
          <div className="card stat"><div className="muted small">ÖT 100 %</div><div className="big">{totals.ot100.toFixed(2)} h</div></div>
          <div className="card stat"><div className="muted small">Km</div><div className="big">{totals.km.toFixed(0)}</div></div>
          <div className="card stat"><div className="muted small">Traktamente</div><div className="big">{totals.allowanceAmount.toFixed(2)} €</div></div>
        </div>
        <div className="card">
          <h2>Månadsvis</h2>
          {monthly.length === 0 ? <div className="muted">Ingen data ännu.</div> : monthly.map(([month, values]) => (
            <div key={month} className="month">
              <div><strong>{formatMonth(month)}</strong></div>
              <div className="mini-grid">
                <div>Arbete: <strong>{values.workHours.toFixed(2)} h</strong></div>
                <div>Restid: <strong>{values.travelHours.toFixed(2)} h</strong></div>
                <div>ÖT 50 %: <strong>{values.ot50.toFixed(2)} h</strong></div>
                <div>ÖT 100 %: <strong>{values.ot100.toFixed(2)} h</strong></div>
                <div>Km: <strong>{values.km.toFixed(0)}</strong></div>
                <div>Traktamente: <strong>{values.allowanceAmount.toFixed(2)} €</strong></div>
              </div>
            </div>
          ))}
        </div>
        <button className="primary" onClick={exportCsv}>Exportera CSV</button>
      </div>}

      <div className="bottom-nav">
        <button className={activeView==="rapportera" ? "nav active" : "nav"} onClick={()=>setActiveView("rapportera")}>Ny dag</button>
        <button className={activeView==="dagar" ? "nav active" : "nav"} onClick={()=>setActiveView("dagar")}>Rapporter</button>
        <button className={activeView==="summering" ? "nav active" : "nav"} onClick={()=>setActiveView("summering")}>Summering</button>
      </div>
    </div></div>
  );
}

function formatMonth(key) {
  if (!key) return "-";
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("sv-FI", { month: "long", year: "numeric" });
}
