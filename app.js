/* =======================================================
   APP.JS — BASE SAINE
   (aucun conflit Supabase, aucun arrêt JS)
======================================================= */

// =======================================================
// SUPABASE — CLIENT (IMPORTANT : nom différent)
// =======================================================
const SUPABASE_URL = "https://pxdtyaqjxmihaeericqf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZHR5YXFqeG1paGFlZXJpY3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODg1NDEsImV4cCI6MjA5Mjc2NDU0MX0.3sS2Nj9GqcgEAn8OzA1a24xOiwDCIWFL-XKLTd9CWus";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =======================================================
// HELPERS
// =======================================================
const $ = id => document.getElementById(id);

function fillSelect(id, values) {
  const sel = $(id);
  if (!sel) return;
  sel.innerHTML = "";
  values.forEach(v => sel.add(new Option(v, v)));
}

// =======================================================
// DONNÉES
// =======================================================
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
const STATUTS = ["A faire", "En cours", "Terminé"];

// =======================================================
// AUTH
// =======================================================
async function login(email, password) {
  const { error } =
    await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
}

async function signup(email, password) {
  const { error } =
    await supabaseClient.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("Compte créé. Connecte-toi.");
}
async function logout() {
  await supabaseClient.auth.signOut();
  location.reload();
}
// =======================================================
// ONGLET
// =======================================================
function switchTab(tab) {
  $("todo-section").hidden = tab !== "todo";
  $("archive-section").hidden = tab !== "archive";
  $("stats-section").hidden = tab !== "stats";
}

// =======================================================
// BOOT — NE DOIT PAS PLANTER
// =======================================================
document.addEventListener("DOMContentLoaded", async () => {

  alert("BOOT OK ✅");

  // ----- AUTH UI -----
  const { data } = await supabaseClient.auth.getUser();
   
const authForm = $("auth-form");
const userBar = $("user-bar");
const userEmail = $("user-email");

if (data?.user && data.user.email_confirmed_at) {
  authForm.style.display = "none";
  userBar.style.display = "block";
  userEmail.textContent = "Connecté : " + data.user.email;
} else {
  authForm.style.display = "block";
  userBar.style.display = "none";
}

  $("btn-login").onclick = () =>
    login($("auth-email").value, $("auth-password").value);

  $("btn-signup").onclick = () =>
    signup($("auth-email").value, $("auth-password").value);

  // ----- MENUS -----
  fillSelect("famille", FAMILLES);
  fillSelect("categorie", CATEGORIES);
  fillSelect("statut", STATUTS);

  // ----- TABS -----
  $("tab-todo").onclick = () => switchTab("todo");
  $("tab-archive").onclick = () => switchTab("archive");
  $("tab-stats").onclick = () => switchTab("stats");

   $("btn-logout")?.addEventListener("click", logout);
});
