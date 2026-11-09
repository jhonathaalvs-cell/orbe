import { firebaseReady, observeAuth } from "../../services/firebase/firebase.js";
import { mountProfilePage } from "./profile.js";

const root = document.querySelector("#profileRoot");

function showMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.setAttribute("role", "status");
  paragraph.textContent = message;
  root.replaceChildren(paragraph);
}

if (!firebaseReady) {
  showMessage("O Firebase não está configurado. Configure src/services/firebase/firebase-config.local.js e tente novamente.");
} else {
  observeAuth(async (user) => {
    if (!user) {
      window.location.assign("../login/index.html");
      return;
    }

    try {
      const response = await fetch("./view.html");
      if (!response.ok) throw new Error("Não foi possível carregar a página de perfil.");
      root.innerHTML = await response.text();
      await mountProfilePage(user);
    } catch (error) {
      showMessage(error.message || "Não foi possível abrir o perfil.");
    }
  });
}

window.addEventListener("orbe:navigate", (event) => {
  if (event.detail?.page === "inicio") window.location.assign("../../../index.html");
});
