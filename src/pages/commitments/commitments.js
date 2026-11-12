import {
  confirmCommitmentPayment,
  createCommitment,
  firebaseErrorMessage,
  getAccounts,
  getCommitmentOccurrences,
  getCommitments,
  getUserProfile,
  setCommitmentActive,
  skipCommitmentOccurrence,
  updateCommitment,
} from "../../services/firebase/firebase.js";
import { showToastOn } from "../../utils/toast.js";
import { dateKeyInZone } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { currencyFormatter } from "../../utils/format.js";

const frequencies = { once: "Único", daily: "Diário", weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };
let user;
let profile;
let money = currencyFormatter("BRL");
let commitments = [];
let occurrences = [];
let accounts = [];
let selectedMonth;
let selectedOccurrence;
let editingCommitmentId = null;
let toast;

function todayKey() { return dateKeyInZone(profile?.timeZone); }

function monthKey(dateKey) { return dateKey.slice(0, 7); }

function showToast(message) { showToastOn(toast, message); }

function selectedOccurrences() {
  return occurrences.filter((item) => monthKey(item.dueDate) === selectedMonth);
}

function getStatus(item) {
  if (item.status === "paid") return "paid";
  if (item.status === "skipped") return "skipped";
  return item.dueDate < todayKey() ? "overdue" : "pending";
}

function renderChecklist() {
  const monthItems = selectedOccurrences();
  const visibleItems = monthItems.filter((item) => {
    const status = getStatus(item);
    return document.querySelector("#statusFilter").value === "all" || status === document.querySelector("#statusFilter").value;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.commitmentName.localeCompare(b.commitmentName));
  const included = monthItems.filter((item) => item.status !== "skipped");
  const paid = included.filter((item) => item.status === "paid");
  const pending = included.filter((item) => item.status === "pending");
  const overdue = pending.filter((item) => item.dueDate < todayKey());
  document.querySelector("#expectedTotal").textContent = money.format(included.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  document.querySelector("#occurrenceCount").textContent = `${included.length} vencimento${included.length === 1 ? "" : "s"}`;
  document.querySelector("#paidTotal").textContent = money.format(paid.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0));
  document.querySelector("#paidCount").textContent = `${paid.length} pagamento${paid.length === 1 ? "" : "s"}`;
  document.querySelector("#pendingTotal").textContent = money.format(pending.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  document.querySelector("#overdueCount").textContent = overdue.length ? `${overdue.length} em atraso` : "Nenhum vencimento em atraso";
  const monthDate = new Date(`${selectedMonth}-01T12:00:00`);
  document.querySelector("#nextMonth").disabled = selectedMonth >= monthKey(todayKey());
  document.querySelector("#checklistCaption").textContent = `Vencimentos de ${monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
  const list = document.querySelector("#occurrenceList");
  if (!visibleItems.length) {
    list.innerHTML = monthItems.length ? '<p class="empty-transactions">Nenhum vencimento corresponde a esse filtro.</p>' : '<div class="commitment-empty"><b>Nenhum vencimento neste mês</b><span>Cadastre um compromisso ou escolha outro mês para consultar o histórico.</span></div>';
    return;
  }
  list.innerHTML = visibleItems.map((item) => {
    const status = getStatus(item);
    const date = new Date(`${item.dueDate}T12:00:00`);
    const statusLabel = { paid: "Pago", pending: "Pendente", overdue: "Em atraso", skipped: "Dispensado" }[status];
    const amount = item.status === "paid" ? item.paidAmount : item.amount;
    const amountCaption = item.status === "paid" && item.paidAmount !== item.amount ? `Previsto: ${money.format(item.amount)}` : item.paidDate ? `Pago em ${new Date(`${item.paidDate}T12:00:00`).toLocaleDateString("pt-BR")}` : "Valor previsto";
    const actions = item.status === "pending" ? `<div class="occurrence-actions"><button class="confirm-occurrence" type="button" data-action="pay" data-commitment="${escapeHtml(item.commitmentId)}" data-occurrence="${escapeHtml(item.id)}">Confirmar</button><button type="button" data-action="skip" data-commitment="${escapeHtml(item.commitmentId)}" data-occurrence="${escapeHtml(item.id)}">Dispensar</button></div>` : "";
    return `<article class="occurrence-row"><div class="occurrence-date"><b>${date.toLocaleDateString("pt-BR", { day: "2-digit" })}</b><small>${date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</small></div><div class="occurrence-details"><b>${escapeHtml(item.commitmentName || item.name)}</b><small>${escapeHtml(item.commitmentCategory || item.category)} · ${escapeHtml(frequencies[commitments.find((commitment) => commitment.id === item.commitmentId)?.frequency] || "Compromisso")}</small></div><div class="occurrence-amount"><strong>${money.format(amount || 0)}</strong><small>${escapeHtml(amountCaption)}</small></div><span class="occurrence-status status-${status}">${statusLabel}</span>${actions}</article>`;
  }).join("");
}

function renderRecurrences() {
  const list = document.querySelector("#recurrenceList");
  if (!commitments.length) {
    list.innerHTML = '<div class="commitment-empty"><b>Nenhum compromisso cadastrado</b><span>Cadastre sua primeira conta recorrente para montar o checklist.</span></div>';
    return;
  }
  list.innerHTML = commitments.map((item) => {
    const record = occurrences.filter((occurrence) => occurrence.commitmentId === item.id);
    const isOnce = item.frequency === "once";
    const onceClosed = isOnce && !item.active;
    const label = onceClosed ? (record.some((occurrence) => occurrence.status === "paid") ? "Concluído" : "Encerrado") : item.active ? "Ativo" : "Pausado";
    const action = onceClosed ? "" : `<div class="recurrence-actions"><button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Editar</button>${isOnce ? `<button class="pause-recurrence" type="button" data-action="cancel" data-id="${escapeHtml(item.id)}">Cancelar</button>` : `<button class="pause-recurrence" type="button" data-action="${item.active ? "pause" : "resume"}" data-id="${escapeHtml(item.id)}">${item.active ? "Pausar" : "Reativar"}</button>`}</div>`;
    const endText = item.endDate ? ` · até ${new Date(`${item.endDate}T12:00:00`).toLocaleDateString("pt-BR")}` : "";
    return `<article class="recurrence-card ${item.active ? "" : "recurrence-paused"}"><div><h3>${escapeHtml(item.name)} <span class="recurrence-state">${label}</span></h3><p>${escapeHtml(item.category)} · ${escapeHtml(frequencies[item.frequency] || "Recorrente")} · ${money.format(item.amount)} · desde ${new Date(`${item.startDate}T12:00:00`).toLocaleDateString("pt-BR")}${endText}</p></div>${action}</article>`;
  }).join("");
}

function render() {
  renderChecklist();
  renderRecurrences();
}

async function reload() {
  commitments = await getCommitments(user.uid);
  occurrences = await getCommitmentOccurrences(user.uid, commitments);
  try { accounts = (await getAccounts(user.uid)).filter((account) => account.active); }
  catch { accounts = []; }
  render();
}

function setEditorMode(editing, commitment = null) {
  const form = document.querySelector("#commitmentEditorForm");
  editingCommitmentId = editing ? commitment.id : null;
  document.querySelector("#editorEyebrow").textContent = editing ? "ATUALIZAR RECORRÊNCIA" : "NOVO COMPROMISSO";
  document.querySelector("#editorTitle").textContent = editing ? "Editar compromisso" : "Cadastrar compromisso";
  document.querySelector("#editorNote").textContent = editing
    ? "As alterações atualizam somente vencimentos futuros ainda pendentes. Pagamentos confirmados permanecem no histórico."
    : "O valor pendente só entra no histórico depois da confirmação do pagamento.";
  form.querySelector(".editor-recurrence").hidden = editing;
  form.querySelector(".editor-end-date").hidden = editing;
  form.elements.frequency.disabled = editing;
  form.elements.startDate.disabled = editing;
  form.elements.endDate.disabled = editing;
  form.reset();
  if (editing) {
    form.elements.name.value = commitment.name;
    form.elements.amount.value = commitment.amount;
    form.elements.category.value = commitment.category;
  } else {
    form.elements.startDate.value = todayKey();
  }
  document.querySelector("#commitmentEditor").showModal();
}

export function mountCommitmentsPage(activeUser) {
  user = activeUser;
  toast = document.querySelector("#toast") || document.querySelector(".toast");
  const editorDialog = document.querySelector("#commitmentEditor");
  const editorForm = document.querySelector("#commitmentEditorForm");
  const paymentDialog = document.querySelector("#paymentDialog");
  const paymentForm = document.querySelector("#paymentForm");
  selectedMonth = monthKey(todayKey());
  const monthInput = document.querySelector("#checklistMonth");
  monthInput.value = selectedMonth;
  monthInput.max = selectedMonth;
  monthInput.addEventListener("change", () => { selectedMonth = monthInput.value || monthKey(todayKey()); if (selectedMonth > monthKey(todayKey())) selectedMonth = monthKey(todayKey()); monthInput.value = selectedMonth; renderChecklist(); });
  document.querySelector("#previousMonth").addEventListener("click", () => {
    const date = new Date(`${selectedMonth}-01T12:00:00`);
    date.setMonth(date.getMonth() - 1);
    selectedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthInput.value = selectedMonth;
    renderChecklist();
  });
  document.querySelector("#nextMonth").addEventListener("click", () => {
    if (selectedMonth >= monthKey(todayKey())) return;
    const date = new Date(`${selectedMonth}-01T12:00:00`);
    date.setMonth(date.getMonth() + 1);
    selectedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthInput.value = selectedMonth;
    renderChecklist();
  });
  document.querySelector("#statusFilter").addEventListener("change", renderChecklist);
  document.querySelector("#newCommitment").addEventListener("click", () => setEditorMode(false));
  document.querySelectorAll(".editor-close").forEach((button) => button.addEventListener("click", () => editorDialog.close()));
  document.querySelectorAll(".payment-close").forEach((button) => button.addEventListener("click", () => paymentDialog.close()));

  editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(editorForm);
    const changes = {
      name: String(data.get("name")).trim(),
      amount: Number(data.get("amount")),
      category: String(data.get("category")).trim(),
    };
    if (!changes.name || changes.name.length > 80 || !changes.category || changes.category.length > 40 || !Number.isFinite(changes.amount) || changes.amount <= 0 || changes.amount > 1000000000) return showToast("Confira nome, categoria e valor do compromisso.");
    const button = editorForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (editingCommitmentId) await updateCommitment(user.uid, editingCommitmentId, changes, profile?.timeZone);
      else {
        const startDate = String(data.get("startDate"));
        const endDate = String(data.get("endDate") || "") || null;
        const commitment = { ...changes, frequency: String(data.get("frequency")), startDate, endDate };
        if (!startDate || (endDate && endDate < startDate)) return showToast("Informe a data inicial e confira se a data final vem depois dela.");
        await createCommitment(user.uid, commitment);
      }
      await reload();
      editorDialog.close();
      showToast(editingCommitmentId ? "Compromisso atualizado. Os pagamentos anteriores foram preservados." : "Compromisso cadastrado.");
    } catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });

  document.querySelector("#recurrenceList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const commitment = commitments.find((item) => item.id === button.dataset.id);
    if (!commitment) return;
    if (button.dataset.action === "edit") return setEditorMode(true, commitment);
    const activating = button.dataset.action === "resume";
    const oneTimeCancel = button.dataset.action === "cancel";
    const verb = oneTimeCancel ? "cancelar" : activating ? "reativar" : "pausar";
    const message = oneTimeCancel
      ? `Cancelar “${commitment.name}”? O vencimento pendente será dispensado.`
      : activating
        ? `Reativar “${commitment.name}”? Os próximos vencimentos voltarão a ser gerados.`
        : `Pausar “${commitment.name}”? Os vencimentos futuros ainda pendentes serão dispensados.`;
    if (!window.confirm(message)) return;
    button.disabled = true;
    try {
      await setCommitmentActive(user.uid, commitment.id, activating ? true : false, profile?.timeZone);
      await reload();
      showToast(`Compromisso ${verb === "cancelar" ? "cancelado" : verb === "reativar" ? "reativado" : "pausado"}.`);
    } catch (error) { button.disabled = false; showToast(firebaseErrorMessage(error)); }
  });

  document.querySelector("#occurrenceList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    selectedOccurrence = occurrences.find((item) => item.commitmentId === button.dataset.commitment && item.id === button.dataset.occurrence);
    if (!selectedOccurrence) return showToast("Esse vencimento não está disponível. Atualize o checklist.");
    if (button.dataset.action === "skip") {
      if (!window.confirm(`Dispensar “${selectedOccurrence.commitmentName || selectedOccurrence.name}” deste mês? O histórico permanecerá registrado.`)) return;
      button.disabled = true;
      try { await skipCommitmentOccurrence(user.uid, selectedOccurrence); await reload(); showToast("Vencimento dispensado."); }
      catch (error) { button.disabled = false; showToast(error.message?.startsWith("Este vencimento") ? error.message : firebaseErrorMessage(error)); }
      return;
    }
    paymentForm.reset();
    paymentForm.elements.amount.value = selectedOccurrence.amount;
    paymentForm.elements.paidDate.value = todayKey();
    paymentForm.elements.paidDate.max = todayKey();
    const accountSelect = paymentForm.elements.accountId;
    accountSelect.innerHTML = accounts.length
      ? `<option value="">Selecione uma conta</option>${accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join("")}`
      : '<option value="">Sem conta vinculada</option>';
    accountSelect.required = accounts.length > 0;
    accountSelect.onchange = () => { paymentForm.elements.paidDate.min = accounts.find((account) => account.id === accountSelect.value)?.openingDate || ""; };
    paymentForm.elements.paidDate.min = "";
    document.querySelector("#paymentContext").textContent = `${selectedOccurrence.commitmentName || selectedOccurrence.name} · previsto ${money.format(selectedOccurrence.amount)}`;
    paymentDialog.showModal();
  });

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedOccurrence) return;
    const data = new FormData(paymentForm);
    const paidAmount = Number(data.get("amount"));
    const paidDate = String(data.get("paidDate"));
    const accountId = String(data.get("accountId") || "");
    const account = accounts.find((item) => item.id === accountId);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount > 1000000000 || !paidDate || paidDate > todayKey() || (account && paidDate < account.openingDate)) return showToast("Confira o valor, a data e a conta do pagamento.");
    if (accounts.length && !account) return showToast("Selecione a conta usada no pagamento.");
    const button = paymentForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await confirmCommitmentPayment(user.uid, selectedOccurrence, paidAmount, profile?.timeZone, accountId, paidDate);
      await reload();
      paymentDialog.close();
      showToast("Pagamento confirmado e registrado no histórico.");
    } catch (error) { showToast(error.message?.startsWith("Esta conta") ? error.message : firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });

  document.querySelector("#paymentForm [name='accountId']").addEventListener("change", () => {
    const accountId = paymentForm.elements.accountId.value;
    paymentForm.elements.paidDate.min = accounts.find((account) => account.id === accountId)?.openingDate || "";
  });

  Promise.all([getUserProfile(user), reload()]).then(([loadedProfile]) => {
    profile = loadedProfile;
    money = currencyFormatter(profile.currency || "BRL");
    render();
  }).catch((error) => {
    document.querySelector("#occurrenceList").innerHTML = '<p class="empty-transactions">Não foi possível carregar os compromissos. Confira a conexão e as regras publicadas do Firestore.</p>';
    showToast(firebaseErrorMessage(error));
  });
}
