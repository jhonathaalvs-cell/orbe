import {
  createAccount,
  createTransfer,
  firebaseErrorMessage,
  getAccounts,
  getTransactions,
  getTransfers,
  updateAccount,
} from "../../services/firebase/firebase.js";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const types = { checking: "Conta corrente", savings: "Poupança", cash: "Dinheiro em carteira", investment: "Investimentos", other: "Outra conta" };
let user;
let accounts = [];
let transactions = [];
let transfers = [];
let toast;

function localDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function accountBalance(account, throughDate = localDateKey()) {
  const since = account.openingDate || "0000-00-00";
  const movementBalance = transactions
    .filter((item) => item.accountId === account.id && item.date >= since && item.date <= throughDate)
    .reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
  const transferBalance = transfers
    .filter((item) => item.date >= since && item.date <= throughDate)
    .reduce((sum, item) => sum + (item.toAccountId === account.id ? item.amount : item.fromAccountId === account.id ? -item.amount : 0), 0);
  return (account.openingBalance || 0) + movementBalance + transferBalance;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function render() {
  const active = accounts.filter((account) => account.active);
  const archived = accounts.filter((account) => !account.active);
  document.querySelector("#accountsTotal").textContent = money.format(accounts.reduce((sum, account) => sum + accountBalance(account), 0));
  document.querySelector("#accountsCount").textContent = `${active.length} conta${active.length === 1 ? "" : "s"} ativa${active.length === 1 ? "" : "s"}`;
  const list = document.querySelector("#accountsList");
  const card = (account) => `<article class="account-card panel ${account.active ? "" : "account-archived"}"><div class="account-card-top"><span class="account-type">${escapeHtml(types[account.type] || types.other)}</span><button class="account-action" type="button" data-action="rename" data-id="${escapeHtml(account.id)}">Renomear</button></div><h2>${escapeHtml(account.name)}</h2><strong>${money.format(accountBalance(account))}</strong><small>Saldo inicial de ${money.format(account.openingBalance || 0)} · desde ${new Date(`${account.openingDate}T12:00:00`).toLocaleDateString("pt-BR")}</small><button class="account-archive" type="button" data-action="${account.active ? "archive" : "restore"}" data-id="${escapeHtml(account.id)}">${account.active ? "Arquivar conta" : "Reativar conta"}</button></article>`;
  list.innerHTML = accounts.length ? `${active.map(card).join("")}${archived.length ? `<h2 class="archived-heading">Contas arquivadas</h2>${archived.map(card).join("")}` : ""}` : '<div class="panel empty-transactions">Nenhuma conta cadastrada. Crie uma conta e informe o saldo atual para começar.</div>';
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const transferList = document.querySelector("#transfersList");
  transferList.innerHTML = transfers.length ? transfers.slice(0, 10).map((item) => `<div class="transfer-row"><span class="transfer-arrow" aria-hidden="true">↔</span><span><b>${escapeHtml(names.get(item.fromAccountId) || "Conta arquivada")}</b><small> para ${escapeHtml(names.get(item.toAccountId) || "Conta arquivada")} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}</small></span><strong>${money.format(item.amount)}</strong></div>`).join("") : '<p class="empty-transactions">Nenhuma transferência registrada.</p>';
  updateTransferOptions(active);
}

function updateTransferOptions(active) {
  const from = document.querySelector('#transferForm [name="fromAccountId"]');
  const to = document.querySelector('#transferForm [name="toAccountId"]');
  const options = active.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${money.format(accountBalance(account))}</option>`).join("");
  from.innerHTML = options;
  to.innerHTML = options;
  if (active.length > 1) to.selectedIndex = 1;
  const updateMinimumDate = () => {
    const earliestDate = [from.value, to.value].map((id) => active.find((account) => account.id === id)?.openingDate || "").sort().at(-1) || "";
    transferFormDate().min = earliestDate;
  };
  from.onchange = updateMinimumDate;
  to.onchange = updateMinimumDate;
  updateMinimumDate();
  document.querySelector("#newTransfer").disabled = active.length < 2;
}

function transferFormDate() {
  return document.querySelector('#transferForm [name="date"]');
}

async function reload() {
  [accounts, transactions, transfers] = await Promise.all([getAccounts(user.uid), getTransactions(user.uid), getTransfers(user.uid)]);
  render();
}

export function mountAccountsPage(activeUser) {
  user = activeUser;
  toast = document.querySelector("#toast") || document.querySelector(".toast");
  const accountDialog = document.querySelector("#accountDialog");
  const accountForm = document.querySelector("#accountForm");
  const transferDialog = document.querySelector("#transferDialog");
  const transferForm = document.querySelector("#transferForm");
  const renameDialog = document.createElement("dialog");
  renameDialog.className = "modal rename-modal";
  renameDialog.setAttribute("aria-labelledby", "renameAccountTitle");
  renameDialog.innerHTML = `<form id="renameAccountForm"><div class="rename-modal-icon" aria-hidden="true">✎</div><div class="rename-modal-heading"><span class="eyebrow">PERSONALIZE SUA CONTA</span><h2 id="renameAccountTitle">Renomear conta</h2><p>Escolha um nome fácil de reconhecer no seu dia a dia.</p></div><button class="rename-modal-close" type="button" aria-label="Fechar">×</button><label for="renameAccountName">Nome da conta<input id="renameAccountName" name="name" required maxlength="50" autocomplete="off" placeholder="Ex.: Conta principal" /></label><small class="rename-hint">Até 50 caracteres</small><div class="modal-actions"><button class="button button-quiet rename-cancel" type="button">Cancelar</button><button class="button button-primary" type="submit">Salvar nome</button></div></form>`;
  document.body.append(renameDialog);
  renameDialog.addEventListener("close", () => renameDialog.remove());
  const renameForm = renameDialog.querySelector("#renameAccountForm");
  let renamingAccountId = null;
  accountForm.elements.openingDate.max = localDateKey();
  document.querySelector("#newAccount").addEventListener("click", () => {
    accountForm.reset();
    accountForm.elements.openingBalance.value = "0";
    accountForm.elements.openingDate.value = localDateKey();
    accountDialog.showModal();
  });
  document.querySelector("#newTransfer").addEventListener("click", () => {
    if (accounts.filter((account) => account.active).length < 2) return showToast("Cadastre pelo menos duas contas ativas para transferir.");
    transferForm.reset();
    transferForm.elements.date.value = localDateKey();
    transferForm.elements.date.min = accounts.filter((account) => account.active).map((account) => account.openingDate).sort().at(-1) || "";
    updateTransferOptions(accounts.filter((account) => account.active));
    transferDialog.showModal();
  });
  document.querySelectorAll(".account-close").forEach((button) => button.addEventListener("click", () => accountDialog.close()));
  document.querySelectorAll(".transfer-close").forEach((button) => button.addEventListener("click", () => transferDialog.close()));
  renameDialog.querySelectorAll(".rename-modal-close, .rename-cancel").forEach((button) => button.addEventListener("click", () => renameDialog.close()));
  renameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(new FormData(renameForm).get("name")).trim();
    if (!name) return renameForm.elements.name.focus();
    if (name.length > 50) return showToast("O nome deve ter até 50 caracteres.");
    const button = renameForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await updateAccount(user.uid, renamingAccountId, { name });
      await reload();
      renameDialog.close();
      showToast("Nome atualizado.");
    } catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });
  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(accountForm);
    const account = { name: String(data.get("name")).trim(), type: String(data.get("type")), openingBalance: Number(data.get("openingBalance")), openingDate: String(data.get("openingDate")) };
    if (!account.name || !Number.isFinite(account.openingBalance) || account.openingBalance < 0 || !account.openingDate || account.openingDate > localDateKey()) return showToast("Confira o nome, saldo inicial e data da conta.");
    const button = accountForm.querySelector('[type="submit"]');
    button.disabled = true;
    try { await createAccount(user.uid, account); await reload(); accountDialog.close(); showToast("Conta cadastrada."); }
    catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });
  transferForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(transferForm);
    const transfer = { fromAccountId: String(data.get("fromAccountId")), toAccountId: String(data.get("toAccountId")), amount: Number(data.get("amount")), date: String(data.get("date")), description: String(data.get("description")).trim() };
    const earliestDate = [transfer.fromAccountId, transfer.toAccountId].map((id) => accounts.find((account) => account.id === id)?.openingDate || "").sort().at(-1) || "";
    if (transfer.fromAccountId === transfer.toAccountId || !Number.isFinite(transfer.amount) || transfer.amount <= 0 || !transfer.description || !transfer.date || transfer.date < earliestDate || transfer.date > localDateKey()) return showToast("Confira as contas, o valor e a data da transferência.");
    const source = accounts.find((account) => account.id === transfer.fromAccountId);
    if (source && transfer.amount > accountBalance(source, transfer.date)) return showToast("O valor da transferência é maior que o saldo disponível na conta de origem.");
    const button = transferForm.querySelector('[type="submit"]');
    button.disabled = true;
    try { await createTransfer(user.uid, transfer); await reload(); transferDialog.close(); showToast("Transferência registrada."); }
    catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });
  document.querySelector("#accountsList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const account = accounts.find((item) => item.id === button.dataset.id);
    if (!account) return;
    const action = button.dataset.action;
    if (action === "rename") {
      renamingAccountId = account.id;
      renameForm.reset();
      renameForm.elements.name.value = account.name;
      renameDialog.showModal();
      requestAnimationFrame(() => renameForm.elements.name.focus());
      return;
    }
    const changes = { active: action === "restore" };
    if (action === "archive" && !window.confirm(`Arquivar ${account.name}? As movimentações e o saldo histórico serão preservados.`)) return;
    button.disabled = true;
    try { await updateAccount(user.uid, account.id, changes); await reload(); showToast(action === "restore" ? "Conta reativada." : "Conta arquivada."); }
    catch (error) { showToast(firebaseErrorMessage(error)); }
  });
  reload().catch((error) => {
    document.querySelector("#accountsList").innerHTML = '<div class="panel empty-transactions">Não foi possível carregar as contas. Verifique se as regras atualizadas do Firestore foram publicadas.</div>';
    showToast(firebaseErrorMessage(error));
  });
}
