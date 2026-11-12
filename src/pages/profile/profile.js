import {
  firebaseErrorMessage,
  getUserProfile,
  saveUserProfile,
  sendPasswordReset,
} from "../../services/firebase/firebase.js";

export async function mountProfilePage(user) {
  const form = document.querySelector("#profileForm");
  if (!form) return;

  const saveButton = document.querySelector("#saveProfile");
  const feedback = document.querySelector("#profileFeedback");
  const currency = form.elements.currency;
  const timeZone = form.elements.timeZone;
  const dueReminder = form.elements.commitmentDue;
  const overdueReminder = form.elements.commitmentOverdue;

  function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("profile-feedback-error", isError);
    feedback.hidden = false;
  }

  document.querySelector("#profileBack")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("orbe:navigate", { detail: { page: "inicio" } }));
  });

  try {
    const profile = await getUserProfile(user);
    if (!document.body.contains(form)) return;
    form.elements.name.value = profile.name;
    form.elements.email.value = profile.email;
    form.elements.createdAt.value = profile.createdAt?.toDate
      ? profile.createdAt.toDate().toLocaleDateString("pt-BR")
      : "Data não disponível";
    currency.value = profile.currency;
    timeZone.value = profile.timeZone;
    dueReminder.checked = profile.notificationPreferences.commitmentDue;
    overdueReminder.checked = profile.notificationPreferences.commitmentOverdue;
  } catch (error) {
    showFeedback(firebaseErrorMessage(error), true);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const name = String(form.elements.name.value || "").trim();
    if (name.length < 2) return showFeedback("Informe seu nome completo.", true);
    saveButton.disabled = true;
    feedback.hidden = true;
    try {
      await saveUserProfile(user, {
        name,
        currency: currency.value,
        timeZone: timeZone.value,
        notificationPreferences: {
          commitmentDue: dueReminder.checked,
          commitmentOverdue: overdueReminder.checked,
        },
      });
      const profileName = document.querySelector("#profileName");
      if (profileName) profileName.textContent = name;
      showFeedback("Perfil atualizado com sucesso.");
    } catch (error) {
      showFeedback(firebaseErrorMessage(error), true);
    } finally {
      saveButton.disabled = false;
    }
  });

  document.querySelector("#resetPassword")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    feedback.hidden = true;
    try {
      await sendPasswordReset(user.email);
      showFeedback(`Enviamos o link de redefinição para ${user.email}.`);
    } catch (error) {
      showFeedback(firebaseErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
}
