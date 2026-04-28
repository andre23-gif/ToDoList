/* =======================================================
   APP.JS — VERSION COMPLÈTE
   - Auth Supabase
   - Menus, archives, statistiques
   - Compatible GitHub Pages / PWA / Safari
======================================================= */

// =======================================================
// SUPABASE — CONFIG
// =======================================================
const SUPABASE_URL = "https://pxdtyaqjxmihaeericqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZHR5YXFqeG1paGFlZXJpY3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODg1NDEsImV4cCI6MjA5Mjc2NDU0MX0.3sS2Nj9GqcgEAn8OzA1a24xOiwDCIWFL-XKLTd9CWus";
const SUPABASE_TABLE = "Tasks";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================================================
// DONNÉES FIXES
// =======================================================
const FAMILLES = [
  "Amicale","Baroque","CDC/suivi","Communication","Coordination","Correction",
  "Cours","Gestion","Histoire des Arts","Instances","Numérique","Parcours Avenir",
  "Pépinières","Photocopies","Préparation","Réunion"
];

const CATEGORIES = [
  "Moi-même","Parents","Partenaires","Collègues",
  "Administration","Elèves","Professeurs principaux","Public"
];

const STATUTS = ["A faire","En cours","Terminé"];

// =======================================================
// HELPERS
// =======================================================
const $ = id => document.getElementById(id);

function fillSelect(id, values, selected){
  const sel = $(id);
  if (!sel) return;
  sel.innerHTML = "";
  values.forEach(v=>{
    const o = new Option(v,v);
    if(v===selected) o.selected = true;
    sel.add(o);
  });
}

function esc(s){
  return (s||"").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m])
  );
}

// =======================================================
// AUTH
// =======================================================
async function login(email, password){
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) return alert(error.message);
  location.reload();
}

async function signup(email, password){
  const { error } = await supabase.auth.signUp({ email, password });
  if(error) return alert(error.message);
  alert("Compte créé. Connecte‑toi.");
}

// =======================================================
// SUPABASE — SERVEUR
// =======================================================
let SERVER_CACHE = null;

function sbHeaders(extra={}){
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    ...extra
  };
}

async function serverInit(){
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=uid,updated_at,payload`;
  const r = await fetch(url,{ headers: sbHeaders() });
  const rows = await r.json();
  SERVER_CACHE = rows.map(r=>r.payload).filter(Boolean).map(it=>{
    it.id = it.uid;
    return it;
  });
}

async function getAll(){
  if(!SERVER_CACHE) await serverInit();
  return SERVER_CACHE.slice();
}

async function serverUpsert(item){
  const row = {
    uid: item.uid,
    updated_at: Date.now(),
    payload: item,
    action: item.actionPrecise || "",
    statut: item.statut || "A faire"
  };
  await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=uid`,{
    method:"POST",
    headers: sbHeaders({
      "Content-Type":"application/json",
      "Prefer":"resolution=merge-duplicates"
    }),
    body: JSON.stringify(row)
  });
}

async function addItem(item){
  if(!item.uid) item.uid = crypto.randomUUID();
  await serverUpsert(item);
  if(!SERVER_CACHE) SERVER_CACHE=[];
  SERVER_CACHE.unshift(item);
}

async function del(uid){
  await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?uid=eq.${uid}`,{
    method:"DELETE",
    headers: sbHeaders()
  });
  SERVER_CACHE = SERVER_CACHE.filter(x=>x.uid!==uid);
}

// =======================================================
// UI — ONGLET
// =======================================================
function switchTab(tab){
  $("todo-section").hidden = tab!=="todo";
  $("archive-section").hidden = tab!=="archive";
  $("stats-section").hidden = tab!=="stats";
  $("tab-todo").classList.toggle("active",tab==="todo");
  $("tab-archive").classList.toggle("active",tab==="archive");
  $("tab-stats").classList.toggle("active",tab==="stats");
}

// =======================================================
// RENDER LISTES
// =======================================================
async function render(){
  const all = await getAll();
  const todo = all.filter(x=>x.statut!=="Terminé");
  const arch = all.filter(x=>x.statut==="Terminé");

  $("todo-list").innerHTML="";
  todo.forEach(it=>{
    const li=document.createElement("li");
    li.className="item";
    li.innerHTML=`
      <div class="done">✓</div>
      <div class="main">
        <div class="line">${esc(it.actionPrecise)}</div>
        <div class="meta">${esc(it.famille||"")} • ${esc(it.categorie||"")}</div>
      </div>
      <select class="status">
        ${STATUTS.map(s=>`<option ${it.statut===s?"selected":""}>${s}</option>`).join("")}
      </select>
      <div class="trash">🗑</div>
    `;
    li.querySelector(".trash").onclick=async()=>{ await del(it.uid); render(); };
    li.querySelector(".status").onchange=async e=>{
      it.statut=e.target.value;
      await serverUpsert(it);
      render();
    };
    $("todo-list").appendChild(li);
  });

  $("archive-list").innerHTML="";
  arch.forEach(it=>{
    const li=document.createElement("li");
    li.className="item";
    li.innerHTML=`<div class="main">${esc(it.actionPrecise)}</div>`;
    $("archive-list").appendChild(li);
  });
}

// =======================================================
// BOOT
// =======================================================
document.addEventListener("DOMContentLoaded", async()=>{
// Sécurité : ne pas planter si le formulaire n'est pas encore géré
if (!document.getElementById("add-form")) return;
  // AUTH UI
  const { data } = await supabase.auth.getUser();
  $("auth-form").style.display = data?.user ? "none" : "block";

  // boutons auth
  $("btn-login").onclick=()=>login($("auth-email").value,$("auth-password").value);
  $("btn-signup").onclick=()=>signup($("auth-email").value,$("auth-password").value);

  // menus
  fillSelect("famille",FAMILLES,FAMILLES[0]);
  fillSelect("categorie",CATEGORIES,"Moi-même");
  fillSelect("statut",STATUTS,"A faire");

  // tabs
  $("tab-todo").onclick=()=>switchTab("todo");
  $("tab-archive").onclick=()=>switchTab("archive");
  $("tab-stats").onclick=()=>switchTab("stats");

  await serverInit();
  render();
});
