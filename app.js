/* =======================================================
   app.js — COMPLET (PWA offline + Supabase + ToDo/Archives/Stats/Réunions)
   Version unique propre (aucune coupe de fonctionnalités)
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
// =======================================================
// SYNC DOT (pastille en haut à droite)
// vert = synchro OK, orange = synchro en cours, rouge = en attente/offline
// =======================================================
function setSyncDot(color, visible) {
  const dot = document.getElementById("sync-dot");
  if (!dot) return;
  dot.style.background = color;
  dot.style.display = visible ? "block" : "none";
}

function refreshSyncDot() {
  const q = loadQueue();
  const isConnected = CURRENT_USER && CURRENT_USER.email_confirmed_at;

  if (!isConnected) {
    setSyncDot("#2CA768", false); // caché si non connecté
    return;
  }

  if (!navigator.onLine) {
    setSyncDot("#7B2D2D", true); // rouge si hors-ligne
    return;
  }

  if (q.length > 0) {
    setSyncDot("#7B2D2D", true); // rouge si des opérations en attente
    return;
  }

  setSyncDot("#2CA768", true);   // vert si tout est OK
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
let SERVER_CACHE = null;   // array of items

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
  // On récupère aussi les colonnes SQL, mais on continue à utiliser payload comme vérité principale
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("uid, updated_at, created_at, action, statut, owner, payload")
    .order("updated_at", { ascending: false });

  if(error) throw error;

  const items = (data || [])
    .map(r => {
      const it = r.payload || {};

      // réinjecter l’identifiant si payload incomplet
      it.uid = it.uid || r.uid;
      it.id = it.uid;

      // owner
      it.owner = it.owner || r.owner || null;

      // updatedAt en ms (colonne updated_at = int8)
      if (!it.updatedAt && r.updated_at != null) it.updatedAt = r.updated_at;

      // createdAt en ms si possible
      if (!it.createdAt && r.created_at) {
        const ms = Date.parse(r.created_at);
        if (Number.isFinite(ms)) it.createdAt = ms;
      }

      // si payload ne contient pas actionPrecise/statut, fallback des colonnes
      if (!it.actionPrecise && r.action) it.actionPrecise = r.action;
      if (!it.statut && r.statut) it.statut = r.statut;

      return normalizeItem(it);
    })
    .filter(Boolean);

  SERVER_CACHE = items;
  saveLocalCache(items);
  return items;
}

/* ✅ Écriture serveur complète : payload + colonnes SQL */
async function upsertServer(item){
  if(!CURRENT_USER) throw new Error("Pas d'utilisateur");

  const now = Date.now();

  if(!item.uid) item.uid = makeUID();
  if(!item.createdAt) item.createdAt = now;

  item.updatedAt = now;
  item.device = item.device || DEVICE_ID;
  item.id = item.uid;
  item.owner = CURRENT_USER.id;

  // created_at en timestamp ISO pour la colonne timestamp
  const createdAtISO = new Date(item.createdAt).toISOString();

  const row = {
    uid: item.uid,
    updated_at: item.updatedAt,                     // int8
    owner: CURRENT_USER.id,                         // uuid
    payload: item,                                  // jsonb

    // colonnes SQL (si ta table les impose)
    action: item.actionPrecise || "(sans titre)",   // text NOT NULL
    statut: item.statut || "A faire",               // text
    created_at: createdAtISO                        // timestamp NOT NULL
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
  // si offline / pas connecté : on met juste à jour la pastille et on sort
  if(!navigator.onLine){
    refreshSyncDot();
    return;
  }
  if(!CURRENT_USER){
    refreshSyncDot();
    return;
  }

  const q = loadQueue();
  if(!q.length){
    // rien à envoyer : on remet la pastille à l'état normal (vert/rouge selon cas)
    refreshSyncDot();
    return;
  }

  // il y a des opérations à envoyer => orange "sync en cours"
  setSyncDot("#C8A24A", true);

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

  // fin de synchro : si remaining > 0 => rouge, sinon vert
  refreshSyncDot();
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
  // offline => dernier cache
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

  // online => server + flush (avec gestion d’erreur visible)
  try{
    await upsertServer(item);
    await flushQueue();
  } catch(e){
    queueOp({ type:"upsert", item });
    alert("Sauvegarde serveur échouée (mise en attente) : " + (e?.message || e));
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

  try{
    await deleteServer(uid);
    await flushQueue();
  } catch(e){
    queueOp({ type:"delete", uid });
    alert("Suppression serveur échouée (mise en attente) : " + (e?.message || e));
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
   STATS (canvas) — conservées (tes fonctions)
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

  // axes
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

  // points
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

  // Courbe temps
  const map=new Map();
  filtered.forEach(it=>{
    const k=dateKeyForItem(it);
    const mins = (mode==="reel") ? parseTimeToMinutes(it.tempsReel) : parseTimeToMinutes(it.tempsEstime);
    map.set(k,(map.get(k)||0)+mins);
  });
  const labels=Array.from(map.keys()).sort();
  const values=labels.map(k=>map.get(k));
  drawLine($("lineChart"), labels, values);

  // Légende
  const legend=$("lineLegend");
  if(legend){
    const total=values.reduce((a,b)=>a+b,0);
    const h=Math.floor(total/60), m=total%60;
    legend.textContent = `Total ${mode==="reel"?"réel":"estimé"} : ${h}h${m}min`;
  }

  // Familles
  const fam=new Map();
  filtered.forEach(it=>{
    const k=it.famille||"(Sans famille)";
    fam.set(k,(fam.get(k)||0)+1);
  });
  const famEntries=Array.from(fam.entries()).map(([label,value])=>({label,value}))
    .sort((a,b)=>b.value-a.value).slice(0,8);
  drawPie($("pieChart"), famEntries);
  renderPieLegend(famEntries);

  // Statuts
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
   CSV (export/import)
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
    const action=(iAct>=0 ? (v[iAct]||"") : "").trim();
    if(!action) continue;

    const statut=(iSt>=0 ? (v[iSt]||"A faire") : "A faire").trim();
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
    const stamp=it.archivedAt?new Date(it.archivedAt).toLocaleDateString("fr-FR"):"";
    li.innerHTML=`
      <div class="done" title="Reprendre">↩︎</div>
      <div class="main">
        <div class="line">${esc(it.actionPrecise)}</div>
        <div class="meta">${esc(it.famille||"")} • ${esc(it.categorie||"")}</div>
        <div class="meta">Archivé le ${esc(stamp)}</div>
      </div>
      <div></div><div></div>
    `;
    li.querySelector(".done").addEventListener("click", async()=>{
      await updateStatus(it.uid,"A faire");
      switchTab("todo");
      await render();
    });
    ua.appendChild(li);
  });
}

/* =======================================================
   BOOT
======================================================= */
document.addEventListener("DOMContentLoaded", async()=>{
  refreshNetBanner();
  // auth / user bar
  CURRENT_USER = await getCurrentUser();

  const authForm = $("auth-form");
  const userBar = $("user-bar");
  const userEmail = $("user-email");

  if (CURRENT_USER && CURRENT_USER.email_confirmed_at) {
    authForm.style.display = "none";
    userBar.style.display = "block";
    if(userEmail) userEmail.textContent = "Connecté : " + CURRENT_USER.email;
  } else {
    authForm.style.display = "block";
    userBar.style.display = "none";
  }
 refreshSyncDot();
   
  $("btn-login")?.addEventListener("click", ()=>login($("auth-email").value, $("auth-password").value));
  $("btn-signup")?.addEventListener("click", ()=>signup($("auth-email").value, $("auth-password").value));
  $("btn-logout")?.addEventListener("click", logout);

  // menus
  fillSelect("famille",FAMILLES,FAMILLES[0]);
  fillSelect("categorie",CATEGORIES,"Moi-même");
  fillSelect("statut",STATUTS,"A faire");

  // tabs
  $("tab-todo")?.addEventListener("click", async()=>{ switchTab("todo"); await render(); });
  $("tab-archive")?.addEventListener("click", async()=>{ switchTab("archive"); await render(); });
  $("tab-stats")?.addEventListener("click", async()=>{
  switchTab("stats");
  const all = await getAll();
  await renderStats(all);
});

  // meeting modal
  $("meetingToggle")?.addEventListener("change", (e)=>{ if(e.target.checked) openMeeting(); });
  $("closeMeeting")?.addEventListener("click", closeMeeting);
  $("meetingCancel")?.addEventListener("click", closeMeeting);
  $("meetingOverlay")?.addEventListener("click",(e)=>{ if(e.target===$("meetingOverlay")) closeMeeting(); });

  $("meeting-form")?.addEventListener("submit", async(e)=>{
    e.preventDefault();
    const now = Date.now();
    const meeting={
      date:$("m_date").value,
      time:$("m_time").value,
      place:$("m_place").value.trim(),
      people:$("m_people").value.trim(),
      needs:$("m_needs").value.trim(),
      minutes:$("m_minutes").value.trim()
    };
    const label=`Réunion ${meeting.date||""} ${meeting.time||""}`.trim();

    await saveItem({
      uid: makeUID(),
      createdAt: now,
      updatedAt: now,
      actionPrecise: label || "Réunion",
      famille: "Réunion",
      categorie: "Moi-même",
      nom: meeting.people || "",
      tempsEstime: "",
      tempsReel: "",
      dateLimite: meeting.date || "",
      statut: "A faire",
      archivedAt: null,
      isMeeting: true,
      meeting
    });

    closeMeeting();
    switchTab("todo");
    await render();
  });

  // add-form
  $("add-form")?.addEventListener("submit", async(e)=>{
    e.preventDefault();
    const now = Date.now();
    const statut = $("statut").value;

    await saveItem({
      uid: makeUID(),
      createdAt: now,
      updatedAt: now,
      actionPrecise: $("actionPrecise").value.trim(),
      famille: $("famille").value,
      categorie: $("categorie").value,
      nom: $("nom").value.trim(),
      tempsEstime: $("tempsEstime").value,
      tempsReel: $("tempsReel").value,
      dateLimite: $("dateLimite").value,
      statut,
      archivedAt: statut==="Terminé" ? now : null,
      isMeeting: false,
      meeting: null
    });

    $("add-form").reset();
    fillSelect("statut",STATUTS,"A faire");
    fillSelect("categorie",CATEGORIES,"Moi-même");
    if ($("meetingToggle")) $("meetingToggle").checked=false;
    await render();
  });

  $("reset-btn")?.addEventListener("click", ()=>$("add-form").reset());
  $("statsRefresh")?.addEventListener("click", async()=>renderStats(await getAll()));

  $("export-btn")?.addEventListener("click", exportCSV);
  $("import-btn")?.addEventListener("click", ()=>$("import-file").click());
  $("import-file")?.addEventListener("change", async(e)=>{
    const file=e.target.files?.[0];
    if(!file) return;
    await importCSV(file);
    e.target.value="";
    await render();
  });

// ===== Sync dot + flush automatique au retour réseau =====
  window.addEventListener("online", async () => {
    refreshNetBanner();
    refreshSyncDot();
    try { await flushQueue(); } catch {}
    refreshSyncDot();
  });

  window.addEventListener("offline", () => {
    refreshNetBanner();
    refreshSyncDot();
  });
   
  // load data + flush offline ops
  try{
    await flushQueue();
    await fetchAllFromServer();
  } catch {
    SERVER_CACHE = loadLocalCache();
  }

  await render();
});
