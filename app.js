/* =======================================================
   app.js — COMPLET (PWA offline + Supabase + ToDo/Archives/Stats/Réunions)
   ✅ Corrigé : insert/upsert serveur (action + created_at + statut)
   ✅ Corrigé : esc() (échappement HTML)
   ✅ Corrigé : importCSV() (boucle cassée)
======================================================= */

/* ---------- Supabase Client (NE JAMAIS nommer "supabase") ---------- */
const SUPABASE_URL = "https://pxdtyaqjxmihaeericqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZHR5YXFqeG1paGFlZXJpY3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODg1NDEsImV4cCI6MjA5Mjc2NDU0MX0.3sS2Nj9GqcgEAn8OzA1a24xOiwDCIWFL-XKLTd9CWus";
const TABLE = "Tasks";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- DOM helpers ---------- */
const $ = (id) => document.getElementById(id);

function esc(s){
  return (s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[m]));
}

function fillSelect(id, values, selected){
  const sel = $(id);
  if(!sel) return;
  sel.innerHTML = "";
  values.forEach(v=>{
    const o = new Option(v, v);
    if(v===selected) o.selected = true;
    sel.add(o);
  });
}

/* ---------- Static menus ---------- */
const FAMILLES = [
  "Amicale","Baroque","CDC/suivi","Communication","Coordination","Correction",
  "Cours","Gestion","Histoire des Arts","Instances","Numérique","Parcours Avenir",
  "Pépinières","Photocopies","Préparation","Réunion"
];

const CATEGORIES = [
  "Moi-même",
  "Parents",
  "Partenaires",
  "Collègues",
  "Administration",
  "Elèves",
  "Professeurs principaux",
  "Public"
];

const STATUTS = ["A faire","En cours","Terminé"];

/* ---------- Device id ---------- */
function getDeviceId(){
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("ipad")) return "ipad";
  if (ua.includes("iphone")) return "iphone";
  return "autre";
}
const DEVICE_ID = getDeviceId();

/* ---------- UID ---------- */
function makeUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "uid-" + Math.random().toString(16).slice(2) + "-" + Date.now();
}

/* =======================================================
   OFFLINE CACHE + QUEUE
======================================================= */
const LOCAL_CACHE_KEY = "todo_local_cache_v1";
const LOCAL_QUEUE_KEY = "todo_local_queue_v1";

function saveLocalCache(items){
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(items)); } catch {}
}
function loadLocalCache(){
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "[]"); } catch { return []; }
}
function loadQueue(){
  try { return JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q){
  try { localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function queueOp(op){
  const q = loadQueue();
  q.push(op);
  saveQueue(q);
}

/* =======================================================
   AUTH + USER BAR
======================================================= */
async function login(email, password){
  if(!email || !password) return alert("Merci de saisir email + mot de passe");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if(error) return alert("Erreur de connexion : " + error.message);
  location.reload();
}

async function signup(email, password){
  if(!email || !password) return alert("Merci de saisir email + mot de passe");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if(error) return alert("Erreur d'inscription : " + error.message);
  alert("Compte créé ✅\nConfirme l'email si demandé, puis connecte-toi.");
}

async function logout(){
  await supabaseClient.auth.signOut();
  location.reload();
}

function refreshNetBanner(){
  const b = $("net-banner");
  if(!b) return;
  b.style.display = navigator.onLine ? "none" : "block";
}
window.addEventListener("online", refreshNetBanner);
window.addEventListener("offline", refreshNetBanner);

/* =======================================================
   DATA (Supabase)
======================================================= */
let CURRENT_USER = null;   // { id, email, email_confirmed_at }
let SERVER_CACHE = null;   // array of payload items (with id = uid)

async function getCurrentUser(){
  const { data } = await supabaseClient.auth.getUser();
  return data?.user || null;
}

function normalizeItem(it){
  if(!it) return null;
  it.id = it.uid;
  return it;
}

async function fetchAllFromServer(){
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("uid, updated_at, payload, owner, action, statut, created_at")
    .order("updated_at", { ascending: false });

  if(error) throw error;

  const items = (data || [])
    .map(r => {
      const it = r.payload || {};
      // robustesse : réinjecter uid/owner si absent
      it.uid = it.uid || r.uid;
      it.id = it.uid;
      it.owner = it.owner || r.owner || null;
      // fallback actionPrecise si seulement "action" existe
      if (!it.actionPrecise && r.action) it.actionPrecise = r.action;
      // fallback statut
      if (!it.statut && r.statut) it.statut = r.statut;
      // conserver updatedAt
      it.updatedAt = it.updatedAt || r.updated_at || null;
      return normalizeItem(it);
    })
    .filter(Boolean);

  SERVER_CACHE = items;
  saveLocalCache(items);
  return items;
}

/* ✅ CORRECTION MAJEURE : action + created_at + statut obligatoires */
async function upsertServer(item){
  if(!CURRENT_USER) throw new Error("Pas d'utilisateur");

  const nowMs = Date.now();
  if(!item.uid) item.uid = makeUID();

  // champs payload (ton modèle applicatif)
  if(!item.createdAt) item.createdAt = nowMs;
  item.updatedAt = nowMs;
  item.device = item.device || DEVICE_ID;
  item.id = item.uid;
  item.owner = CURRENT_USER.id;

  // champs SQL (ta table)
  const createdAtISO = new Date(item.createdAt).toISOString();

  const row = {
    uid: item.uid,
    updated_at: item.updatedAt,                 // int8
    created_at: createdAtISO,                   // timestamp (NOT NULL)
    owner: CURRENT_USER.id,                     // uuid
    action: item.actionPrecise || "(sans titre)", // text (NOT NULL)
    statut: item.statut || "A faire",           // text
    payload: item                                // jsonb
  };

  const { error } = await supabaseClient
    .from(TABLE)
    .upsert(row, { onConflict: "uid" });

  if(error) throw error;
}

async function deleteServer(uid){
  const { error } = await supabaseClient.from(TABLE).delete().eq("uid", uid);
  if(error) throw error;
}

async function flushQueue(){
  if(!navigator.onLine) return;
  if(!CURRENT_USER) return;

  const q = loadQueue();
  if(!q.length) return;

  const remaining = [];
  for(const op of q){
    try{
      if(op.type === "upsert") await upsertServer(op.item);
      if(op.type === "delete") await deleteServer(op.uid);
    }catch(e){
      remaining.push(op);
    }
  }
  saveQueue(remaining);
}

/* =======================================================
   BUSINESS: status / finish / meeting
======================================================= */
function isValidHHMM(s){
  if(!/^\d{1,2}:\d{2}$/.test(s||"")) return false;
  const [h,m]=s.split(":").map(n=>parseInt(n,10));
  return Number.isFinite(h) && Number.isFinite(m) && h>=0 && h<=99 && m>=0 && m<60;
}

async function finishTaskById(uid){
  const items = await getAll();
  const it = items.find(x=>x.uid===uid);
  if(!it) return false;

  if(!it.tempsReel){
    const suggestion = it.tempsEstime || "00:00";
    const saisie = prompt("Temps réel passé (HH:MM)", suggestion);
    if(saisie === null) return false;
    if(!isValidHHMM(saisie)){
      alert("Format invalide. Utilise HH:MM (ex: 01:30).");
      return false;
    }
    it.tempsReel = saisie;
  }

  it.statut = "Terminé";
  it.archivedAt = Date.now();
  await saveItem(it);
  return true;
}

async function updateStatus(uid, statut){
  const items = await getAll();
  const it = items.find(x=>x.uid===uid);
  if(!it) return;
  it.statut = statut;
  it.archivedAt = (statut==="Terminé") ? Date.now() : null;
  await saveItem(it);
}

/* =======================================================
   DATA API (online/offline)
======================================================= */
async function getAll(){
  if(!navigator.onLine){
    const cached = loadLocalCache();
    SERVER_CACHE = cached;
    return cached.slice();
  }
  if(SERVER_CACHE) return SERVER_CACHE.slice();
  return await fetchAllFromServer();
}

async function saveItem(item){
  // mise à jour locale immédiate
  if(!SERVER_CACHE) SERVER_CACHE = loadLocalCache();
  const idx = SERVER_CACHE.findIndex(x=>x.uid===item.uid);
  if(idx>=0) SERVER_CACHE[idx] = item; else SERVER_CACHE.unshift(item);
  saveLocalCache(SERVER_CACHE);

  // offline => queue
  if(!navigator.onLine){
    queueOp({ type:"upsert", item });
    return;
  }

  // online => server + flush
  try {
    await upsertServer(item);
    await flushQueue();
  } catch (e) {
    // si écriture serveur refusée, on ne fait pas croire que c’est synchronisé
    queueOp({ type:"upsert", item });
    alert("Sauvegarde serveur refusée (mise en attente) : " + (e?.message || e));
  }
}

async function removeItem(uid){
  if(!SERVER_CACHE) SERVER_CACHE = loadLocalCache();
  SERVER_CACHE = SERVER_CACHE.filter(x=>x.uid!==uid);
  saveLocalCache(SERVER_CACHE);

  if(!navigator.onLine){
    queueOp({ type:"delete", uid });
    return;
  }

  try {
    await deleteServer(uid);
    await flushQueue();
  } catch (e) {
    queueOp({ type:"delete", uid });
    alert("Suppression serveur refusée (mise en attente) : " + (e?.message || e));
  }
}

/* =======================================================
   UI Tabs
======================================================= */
function switchTab(tab){
  $("todo-section").hidden = tab!=="todo";
  $("archive-section").hidden = tab!=="archive";
  $("stats-section").hidden = tab!=="stats";
  $("tab-todo").classList.toggle("active", tab==="todo");
  $("tab-archive").classList.toggle("active", tab==="archive");
  $("tab-stats").classList.toggle("active", tab==="stats");
}

/* =======================================================
   STATS (canvas) — conservé (inchangé)
======================================================= */
function parseTimeToMinutes(t){
  if(!t || !t.includes(":")) return 0;
  const [h,m]=t.split(":").map(n=>parseInt(n,10));
  return (isNaN(h)||isNaN(m))?0:h*60+m;
}
function dateKeyForItem(it){
  if(it.dateLimite) return it.dateLimite;
  if(it.isMeeting && it.meeting?.date) return it.meeting.date;
  return new Date(it.createdAt||Date.now()).toISOString().slice(0,10);
}
function clearCanvas(c){
  const ctx=c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  return ctx;
}
function drawLine(canvas, labels, values){
  const ctx = clearCanvas(canvas);
  const W = canvas.width, H = canvas.height;
  const padL=70,padR=20,padT=20,padB=60;
  const max = Math.max(10, ...values);
  ctx.strokeStyle="rgba(7,22,42,.25)";
  ctx.beginPath();
  ctx.moveTo(padL,padT);
  ctx.lineTo(padL,H-padB);
  ctx.lineTo(W-padR,H-padB);
  ctx.stroke();
  if(!labels.length) return;
  const stepX=(W-padL-padR)/Math.max(1,labels.length-1);
  ctx.strokeStyle="rgba(200,162,74,.95)";
  ctx.lineWidth=3;
  ctx.beginPath();
  labels.forEach((lab,i)=>{
    const x=padL+stepX*i;
    const y=(H-padB)-(H-padT-padB)*(values[i]/max);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle="rgba(200,162,74,.95)";
  labels.forEach((lab,i)=>{
    const x=padL+stepX*i;
    const y=(H-padB)-(H-padT-padB)*(values[i]/max);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
  });
}
const PIE_COLORS=["#C8A24A","#0B1F3B","#2CA768","#7B5F2A","#7D3C98","#1F77B4","#D35400","#2E4053"];
function drawPie(canvas, entries){
  const ctx=clearCanvas(canvas), W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,r=Math.min(W,H)*0.32;
  const total=entries.reduce((s,e)=>s+e.value,0)||1;
  let a=-Math.PI/2;
  entries.forEach((e,i)=>{
    const slice=(e.value/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,a,a+slice); ctx.closePath();
    ctx.fillStyle=PIE_COLORS[i%PIE_COLORS.length]; ctx.fill();
    a+=slice;
  });
}
function renderPieLegend(entries){
  const box = $("pieLegend");
  if(!box) return;
  box.innerHTML = "";
  entries.forEach((e,i)=>{
    const item = document.createElement("div");
    item.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = PIE_COLORS[i%PIE_COLORS.length];
    const txt = document.createElement("span");
    txt.textContent = `${e.label} (${e.value})`;
    item.appendChild(dot);
    item.appendChild(txt);
    box.appendChild(item);
  });
}
function drawBars(canvas, entries){
  const ctx=clearCanvas(canvas);
  const W=canvas.width,H=canvas.height;
  const padL=46,padR=16,padT=18,padB=44;
  const maxV=Math.max(1,...entries.map(e=>e.value));
  const n=Math.max(1,entries.length);
  const slot=(W-padL-padR)/n;
  const barW=Math.max(18,slot*0.55);
  entries.forEach((e,i)=>{
    const x=padL+i*slot+(slot-barW)/2;
    const h=(H-padT-padB)*(e.value/maxV);
    const y=(H-padB)-h;
    ctx.fillStyle="rgba(11,31,59,.85)";
    ctx.fillRect(x,y,barW,h);
  });
}
async function renderStats(items){
  const from=$("statsFrom").value?new Date($("statsFrom").value):null;
  const to=$("statsTo").value?new Date($("statsTo").value):null;
  const mode=$("statsTimeMode").value;
  const filtered=items.filter(it=>{
    const d=new Date(dateKeyForItem(it));
    if(from && d<from) return false;
    if(to && d>to) return false;
    return true;
  });
  const map=new Map();
  filtered.forEach(it=>{
    const k=dateKeyForItem(it);
    const mins = (mode==="reel") ? parseTimeToMinutes(it.tempsReel) : parseTimeToMinutes(it.tempsEstime);
    map.set(k,(map.get(k)||0)+mins);
  });
  const labels=Array.from(map.keys()).sort();
  const values=labels.map(k=>map.get(k));
  drawLine($("lineChart"), labels, values);
  const legend=$("lineLegend");
  if(legend){
    const total=values.reduce((a,b)=>a+b,0);
    const h=Math.floor(total/60), m=total%60;
    legend.textContent = `Total ${mode==="reel"?"réel":"estimé"} : ${h}h${m}min`;
  }
  const fam=new Map();
  filtered.forEach(it=>{
    const k=it.famille||"(Sans famille)";
    fam.set(k,(fam.get(k)||0)+1);
  });
  const famEntries=Array.from(fam.entries()).map(([label,value])=>({label,value}))
    .sort((a,b)=>b.value-a.value).slice(0,8);
  drawPie($("pieChart"), famEntries);
  renderPieLegend(famEntries);
  const st=new Map([["A faire",0],["En cours",0],["Terminé",0]]);
  filtered.forEach(it=>st.set(it.statut,(st.get(it.statut)||0)+1));
  const stEntries=Array.from(st.entries()).map(([label,value])=>({label,value}));
  drawBars($("barChart"), stEntries);
}

/* =======================================================
   Réunion modal
======================================================= */
function openMeeting(){
  $("meetingOverlay").classList.add("open");
  $("meetingOverlay").setAttribute("aria-hidden","false");
}
function closeMeeting(){
  $("meetingOverlay").classList.remove("open");
  $("meetingOverlay").setAttribute("aria-hidden","true");
  $("meeting-form").reset();
  $("meetingToggle").checked=false;
}

/* =======================================================
   CSV (export/import) — ✅ import corrigé
======================================================= */
async function exportCSV(){
  const items = await getAll();
  const headers = ["Numéro","Famille de tâches","Action précise","Catégorie d'interlocuteur","Nom","Temps estimé","Temps réel","Date limite","Statut"];
  const rows = items.map((it, idx)=>[
    idx+1,
    it.famille||"",
    it.actionPrecise||"",
    it.categorie||"",
    it.nom||"",
    it.tempsEstime||"",
    it.tempsReel||"",
    it.dateLimite||"",
    it.statut||""
  ].join(";"));
  const csv=[headers.join(";"),...rows].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="todo-export.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function importCSV(file){
  const text = await file.text();
  const lines=text.split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length<2) return;

  const headers=lines[0].split(";").map(h=>h.trim().toLowerCase());
  const col=(name)=>headers.indexOf(name.toLowerCase());

  const iFam=col("famille de tâches");
  const iAct=col("action précise");
  const iCat=col("catégorie d'interlocuteur");
  const iNom=col("nom");
  const iTE=col("temps estimé");
  const iTR=col("temps réel");
  const iDL=col("date limite");
  const iSt=col("statut");

  for(let i=1;i<lines.length;i++){
    const v=lines[i].split(";");
    const action=(v[iAct]||"").trim();
    if(!action) continue;

    const statut=(v[iSt]||"A faire").trim();
    const now=Date.now();

    await saveItem({
      uid: makeUID(),
      createdAt: now,
      updatedAt: now,
      actionPrecise: action,
      famille: (iFam>=0 ? (v[iFam]||"").trim() : ""),
      categorie: (iCat>=0 ? (v[iCat]||"").trim() : ""),
      nom: (iNom>=0 ? (v[iNom]||"").trim() : ""),
      tempsEstime: (iTE>=0 ? (v[iTE]||"").trim() : ""),
      tempsReel: (iTR>=0 ? (v[iTR]||"").trim() : ""),
      dateLimite: (iDL>=0 ? (v[iDL]||"").trim() : ""),
      statut,
      archivedAt: statut==="Terminé" ? now : null,
      isMeeting:false,
      meeting:null
    });
  }
}

/* =======================================================
   RENDER
======================================================= */
async function render(){
  const all = await getAll();

  const todo=all.filter(x=>x.statut!=="Terminé");
  const arch=all.filter(x=>x.statut==="Terminé").sort((a,b)=>(b.archivedAt||0)-(a.archivedAt||0));

  const ul=$("todo-list"); ul.innerHTML="";
  todo.forEach(it=>{
    const li=document.createElement("li");
    li.className="item"+(it.isMeeting?" meeting":"");

    const temps=[
      it.tempsEstime?`⏳ ${esc(it.tempsEstime)}`:"",
      it.tempsReel?`✅ ${esc(it.tempsReel)}`:""
    ].filter(Boolean).join(" • ");

    const meetingInfo=it.isMeeting && it.meeting ? `📍 ${esc(it.meeting.place||"")} • 🗓 ${esc(it.meeting.date||"")} ${esc(it.meeting.time||"")}`:"";

    li.innerHTML=`
      <div class="done" title="Terminé">✓</div>
      <div class="main">
        <div class="line">${esc(it.actionPrecise)}</div>
        <div class="meta">
          ${esc(it.famille||"")} • ${esc(it.categorie||"")}
          ${it.nom?` • ${esc(it.nom)}`:""}
          ${it.dateLimite?` • 📅 ${esc(it.dateLimite)}`:""}
          ${temps?` • ${temps}`:""}
          ${meetingInfo?` • ${meetingInfo}`:""}
        </div>
      </div>
      <select class="status">
        ${STATUTS.map(s=>`<option value="${s}" ${it.statut===s?"selected":""}>${s}</option>`).join("")}
      </select>
      <div class="trash" title="Supprimer">🗑</div>
    `;

    li.querySelector(".done").addEventListener("click", async()=>{
      const ok = await finishTaskById(it.uid);
      if(ok) await render();
    });

    li.querySelector(".trash").addEventListener("click", async()=>{
      await removeItem(it.uid);
      await render();
    });

    li.querySelector(".status").addEventListener("change", async(e)=>{
      if(e.target.value==="Terminé"){
        await finishTaskById(it.uid);
        await render();
      }else{
        await updateStatus(it.uid, e.target.value);
        await render();
      }
    });

    ul.appendChild(li);
  });

  const ua=$("archive-list"); ua.innerHTML="";
  arch.forEach(it=>{
    const li=document.createElement("li");
    li.className="item archive-item";
