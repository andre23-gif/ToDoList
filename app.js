// ===============================
// TEST DE CHARGEMENT app.js
// ===============================
alert("APP.JS EST BIEN CHARGÉ");

// ===============================
// TEST DE CLIC (SANS SUPABASE)
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#auth-form button");
  if (btn) {
    btn.addEventListener("click", () => {
      alert("CLIC CAPTÉ PAR APP.JS");
    });
  }
});
