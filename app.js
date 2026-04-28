document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");

  const btnLogin = document.getElementById("btn-login");
  const btnSignup = document.getElementById("btn-signup");

  if (btnLogin) {
    btnLogin.addEventListener("click", () => {
      login(emailInput.value, passwordInput.value);
    });
  }

  if (btnSignup) {
    btnSignup.addEventListener("click", () => {
      signup(emailInput.value, passwordInput.value);
    });
  }
});
