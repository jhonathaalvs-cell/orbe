import { firebaseReady, firebaseErrorMessage, logIn, registerAccount } from "../../services/firebase/firebase.js";

export function mountLoginPage() {
  const authForm = document.querySelector("#authForm");
  const authError = document.querySelector("#authError");
  const authSwitch = document.querySelector("#authSwitch");
  const authSubmit = document.querySelector("#authSubmit");
  const authSwitchText = document.querySelector("#authSwitchText");
  const nameInput = document.querySelector("#authName");
  const passwordInput = document.querySelector("#authPassword");
  let mode = "login";

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === "register";
    document.querySelector("#authTitle").textContent = registering ? "Crie sua conta" : "Acesse sua conta";
    document.querySelector("#nameField").hidden = !registering;
    nameInput.required = registering;
    authSwitchText.textContent = registering ? "Já tem uma conta?" : "Ainda não tem conta?";
    authSwitch.textContent = registering ? "Entrar" : "Criar conta";
    authSubmit.textContent = registering ? "Criar conta" : "Entrar";
    passwordInput.autocomplete = registering ? "new-password" : "current-password";
    authError.hidden = true;
  }

  authSwitch.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authForm.reportValidity()) return;
    if (!firebaseReady) {
      authError.textContent = "Firebase não configurado. Preencha src/services/firebase/firebase-config.local.js.";
      authError.hidden = false;
      return;
    }

    const data = new FormData(authForm);
    authSubmit.disabled = true;
    authError.hidden = true;
    try {
      if (mode === "register") {
        await registerAccount({
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || ""),
        });
      } else {
        await logIn(String(data.get("email") || "").trim(), String(data.get("password") || ""));
      }
      if (document.body.dataset.standaloneAuth === "true") {
        window.location.assign("../../../index.html");
      }
    } catch (error) {
      authError.textContent = firebaseErrorMessage(error);
      authError.hidden = false;
    } finally {
      authSubmit.disabled = false;
    }
  });

  if (!firebaseReady) {
    document.querySelector("#authConfig").hidden = false;
    authSubmit.disabled = true;
    authError.textContent = "Firebase ainda não está configurado neste projeto.";
    authError.hidden = false;
  }
}
