import {
  addCreditCardPurchase,
  createCreditCard,
  firebaseErrorMessage,
  getAccounts,
  getCreditCards,
  getUserProfile,
  payCreditCardInvoice,
  updateCreditCard,
} from "../../services/firebase/firebase.js";
import { showToastOn } from "../../utils/toast.js";
import { dateKeyInZone } from "../../utils/date.js";
import { escapeHtml as safe } from "../../utils/dom.js";
import { currencyFormatter } from "../../utils/format.js";

let user;
let profile;
let cards = [];
let accounts = [];
let hasRegisteredAccounts = false;
let editingCardId = null;
let selectedInvoice = null;
let toast;
let money = currencyFormatter("BRL");
const brands = { visa: "Visa", mastercard: "Mastercard", elo: "Elo", amex: "American Express", other: "Outra" };

function todayKey() { return dateKeyInZone(profile?.timeZone); }
function currentMonth() { return todayKey().slice(0, 7); }
function monthLabel(key) { return new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); }
function showToast(message) { showToastOn(toast, message); }
function explainError(error) {
  return error?.message && !["permission-denied", "unavailable"].includes(error.code) ? error.message : firebaseErrorMessage(error);
}
function invoiceMonthFor(date, closingDay) {
  const [year, month, day] = date.split("-").map(Number);
  const invoiceDate = new Date(year, month - 1 + (day > closingDay ? 1 : 0), 1);
  return `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, "0")}`;
}
function invoiceDueDate(invoiceMonth, closingDay, dueDay) {
  const [year, month] = invoiceMonth.split("-").map(Number);
  const dueMonth = new Date(year, month - 1 + (dueDay <= closingDay ? 1 : 0), 1);
  return `${dueMonth.getFullYear()}-${String(dueMonth.getMonth() + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
}
function buildInstallments(total, date, card, count) {
  const firstMonth = invoiceMonthFor(date, card.closingDay);
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const extraCents = totalCents % count;
  const [year, month] = firstMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const monthDate = new Date(year, month - 1 + index, 1);
    const invoiceMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    return { amount: (base + (index < extraCents ? 1 : 0)) / 100, date, invoiceMonth, dueDate: invoiceDueDate(invoiceMonth, card.closingDay, card.dueDay), ...(count > 1 ? { installmentNumber: index + 1, installmentCount: count } : {}) };
  });
}
function unpaidTotal(card) { return (card.invoices || []).filter((invoice) => invoice.status === "open").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0); }

function renderMetrics() {
  const active = cards.filter((card) => card.active);
  const limit = active.reduce((sum, card) => sum + Number(card.creditLimit || 0), 0);
  const used = active.reduce((sum, card) => sum + unpaidTotal(card), 0);
  const openCount = cards.reduce((sum, card) => sum + (card.invoices || []).filter((invoice) => invoice.status === "open").length, 0);
  const activeLabel = active.length === 1 ? "1 cartão ativo" : `${active.length} cartões ativos`;
  document.querySelector("#cardMetrics").innerHTML = `<article class="card-metric metric-limit"><span>Limite total ativo</span><strong>${money.format(limit)}</strong><small>${activeLabel}</small></article><article class="card-metric metric-used"><span>Em faturas abertas</span><strong>${money.format(used)}</strong><small>Compras aguardando pagamento</small></article><article class="card-metric metric-available"><span>Limite disponível estimado</span><strong>${money.format(Math.max(0, limit - used))}</strong><small>${openCount} fatura${openCount === 1 ? "" : "s"} em aberto</small></article>`;
}

function renderCards() {
  const list = document.querySelector("#creditCardList");
  if (!cards.length) {
    list.innerHTML = '<div class="panel card-empty"><span class="card-empty-icon">▤</span><h3>Cadastre seu primeiro cartão</h3><p>Informe o limite e os dias de fechamento e vencimento para organizar compras e faturas.</p><button class="button button-primary" type="button" data-action="new-card">Cadastrar cartão</button></div>';
    return;
  }
  list.innerHTML = cards.map((card) => {
    const used = unpaidTotal(card);
    const pct = card.creditLimit ? Math.min(100, used / card.creditLimit * 100) : 0;
    return `<article class="credit-card ${card.active ? "" : "credit-card-archived"}"><div class="credit-card-face brand-${safe(card.brand)}"><div class="credit-card-face-top"><span class="credit-card-chip" aria-hidden="true">▦</span><span class="credit-card-brand">${safe(brands[card.brand] || "Cartão")}</span></div><div class="credit-card-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;${card.lastFour ? safe(card.lastFour) : "••••"}</div><div class="credit-card-face-bottom"><span>${safe(card.name)}</span><b>${card.active ? "CRÉDITO" : "ARQUIVADO"}</b></div></div><div class="credit-card-info"><div class="credit-card-limit"><span>Limite utilizado</span><strong>${money.format(used)} <small>de ${money.format(card.creditLimit)}</small></strong></div><div class="card-limit-track"><i style="width:${pct}%"></i></div><div class="credit-card-dates"><span>Fecha dia <b>${card.closingDay}</b></span><span>Vence dia <b>${card.dueDay}</b></span></div><div class="credit-card-actions">${card.active ? `<button type="button" data-action="buy" data-card="${card.id}">＋ Compra</button>` : ""}<button type="button" data-action="edit" data-card="${card.id}">Editar</button><button type="button" class="archive-card" data-action="archive" data-card="${card.id}">${card.active ? "Arquivar" : "Reativar"}</button></div></div></article>`;
  }).join("");
}

function renderInvoices() {
  const selected = document.querySelector("#invoiceMonth").value || currentMonth();
  const invoices = cards.flatMap((card) => (card.invoices || []).filter((invoice) => invoice.invoiceMonth === selected).map((invoice) => ({ ...invoice, card })));
  invoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const list = document.querySelector("#invoiceList");
  if (!invoices.length) {
    list.innerHTML = `<div class="card-empty-inline"><span>▤</span><div><strong>Nenhuma fatura em ${safe(monthLabel(selected))}</strong><small>Registre uma compra e ela será agrupada pela data de fechamento do cartão.</small></div></div>`;
    return;
  }
  list.innerHTML = invoices.map((invoice) => {
    const paid = invoice.status === "paid";
    const overdue = !paid && invoice.dueDate < todayKey();
    const status = paid ? "Paga" : overdue ? "Vencida" : "Em aberto";
    return `<article class="invoice-row ${paid ? "invoice-paid" : overdue ? "invoice-overdue" : ""}"><div class="invoice-icon">${paid ? "✓" : "▤"}</div><div class="invoice-info"><strong>${safe(invoice.card.name)}</strong><small>${invoice.purchaseCount} compra${invoice.purchaseCount === 1 ? "" : "s"} · vencimento ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}${paid ? ` · pago em ${new Date(`${invoice.paidDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</small></div><span class="invoice-status">${status}</span><strong class="invoice-total">${money.format(invoice.status === "paid" ? invoice.paidAmount : invoice.total)}</strong>${paid ? "" : `<button class="invoice-pay" type="button" data-action="pay-invoice" data-card="${invoice.card.id}" data-invoice="${invoice.id}">Pagar fatura</button>`}</article>`;
  }).join("");
}

function renderPurchases() {
  const purchases = cards.flatMap((card) => (card.purchases || []).map((purchase) => ({ ...purchase, card, invoice: card.invoices.find((item) => item.id === purchase.invoiceMonth) })));
  purchases.sort((a, b) => b.date.localeCompare(a.date));
  const list = document.querySelector("#cardPurchaseList");
  if (!purchases.length) {
    list.innerHTML = '<div class="card-empty-inline"><span>↗</span><div><strong>Nenhuma compra registrada</strong><small>Suas compras aparecem aqui depois de serem cadastradas.</small></div></div>';
    return;
  }
  list.innerHTML = purchases.slice(0, 30).map((item) => { const installment = item.installmentCount > 1 ? ` · Parcela ${item.installmentNumber}/${item.installmentCount}` : ""; return `<article class="card-purchase-row"><span class="purchase-icon">↗</span><div class="purchase-info"><strong>${safe(item.description)}${installment}</strong><small>${safe(item.card.name)} · ${safe(item.category)} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}</small></div><span class="purchase-invoice-label ${item.invoice?.status === "paid" ? "purchase-settled" : ""}">${item.invoice?.status === "paid" ? "Fatura paga" : `Fatura ${safe(monthLabel(item.invoiceMonth))}`}</span><strong>${money.format(item.amount)}</strong></article>`; }).join("");
}

function render() { renderMetrics(); renderCards(); renderInvoices(); renderPurchases(); }

async function reload() {
  const [savedCards, savedAccounts] = await Promise.all([getCreditCards(user.uid), getAccounts(user.uid)]);
  cards = savedCards;
  hasRegisteredAccounts = savedAccounts.length > 0;
  accounts = savedAccounts.filter((account) => account.active);
  render();
}

function openCardEditor(card = null) {
  editingCardId = card?.id || null;
  const form = document.querySelector("#cardForm");
  form.reset();
  document.querySelector("#cardFormEyebrow").textContent = card ? "EDITAR CARTÃO" : "NOVO CARTÃO";
  document.querySelector("#cardFormTitle").textContent = card ? "Atualizar cartão" : "Cadastrar cartão";
  if (card) {
    form.elements.name.value = card.name;
    form.elements.brand.value = card.brand;
    form.elements.lastFour.value = card.lastFour || "";
    form.elements.creditLimit.value = card.creditLimit;
    form.elements.closingDay.value = card.closingDay;
    form.elements.dueDay.value = card.dueDay;
  }
  document.querySelector("#cardDialog").showModal();
}

function updateInvoicePreview() {
  const form = document.querySelector("#purchaseForm");
  const card = cards.find((item) => item.id === form.elements.cardId.value);
  const date = form.elements.date.value;
  const amount = Number(form.elements.amount.value || 0);
  const count = Number(form.elements.installmentCount?.value || 1);
  const preview = document.querySelector("#invoicePreview");
  if (!card || !date) { preview.textContent = "Escolha um cartao e uma data para ver a previsao da fatura."; return; }
  const installments = buildInstallments(amount, date, card, count);
  const first = installments[0];
  const dueDate = invoiceDueDate(first.invoiceMonth, card.closingDay, card.dueDay);
  preview.innerHTML = count > 1
    ? `Compra parcelada em <strong>${count}x of ${money.format(first.amount)}</strong>. Primeira fatura: <strong>${safe(monthLabel(first.invoiceMonth))}</strong>; ultima: <strong>${safe(monthLabel(installments.at(-1).invoiceMonth))}</strong>.`
    : `Esta compra entrara na fatura de <strong>${safe(monthLabel(first.invoiceMonth))}</strong>, com vencimento em <strong>${new Date(`${dueDate}T12:00:00`).toLocaleDateString("pt-BR")}</strong>.`;
}
function openPurchase(cardId = "") {
  if (!cards.some((card) => card.active)) return showToast("Cadastre ou reative um cartão antes de registrar compras.");
  const form = document.querySelector("#purchaseForm");
  form.reset();
  form.elements.cardId.innerHTML = cards.filter((card) => card.active).map((card) => `<option value="${card.id}">${safe(card.name)} · ${safe(brands[card.brand])}</option>`).join("");
  if (cardId && cards.some((card) => card.id === cardId && card.active)) form.elements.cardId.value = cardId;
  form.elements.date.value = todayKey();
  form.elements.date.max = todayKey();
  updateInvoicePreview();
  document.querySelector("#purchaseDialog").showModal();
}

function openInvoicePayment(card, invoice) {
  if (hasRegisteredAccounts && accounts.length === 0) return showToast("Ative uma conta ou carteira para registrar o pagamento da fatura.");
  selectedInvoice = { card, invoice };
  const form = document.querySelector("#payInvoiceForm");
  form.reset();
  form.elements.amount.value = money.format(invoice.total);
  form.elements.paidDate.value = todayKey();
  form.elements.paidDate.max = todayKey();
  form.elements.accountId.innerHTML = accounts.length
    ? `<option value="">Selecione uma conta</option>${accounts.map((account) => `<option value="${account.id}">${safe(account.name)}</option>`).join("")}`
    : '<option value="">Sem conta vinculada</option>';
  form.elements.accountId.required = accounts.length > 0;
  document.querySelector("#invoiceAccountField").hidden = accounts.length === 0;
  document.querySelector("#payInvoiceContext").textContent = `${card.name} · fatura de ${monthLabel(invoice.id)} · vence ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}`;
  document.querySelector("#payInvoiceDialog").showModal();
}

export function mountCardsPage(activeUser) {
  user = activeUser;
  toast = document.querySelector("#toast") || document.querySelector(".toast");
  const cardDialog = document.querySelector("#cardDialog");
  const cardForm = document.querySelector("#cardForm");
  const purchaseDialog = document.querySelector("#purchaseDialog");
  const purchaseForm = document.querySelector("#purchaseForm");
  if (!purchaseForm.elements.installmentCount) {
    const label = document.createElement("label");
    label.innerHTML = 'Parcelamento<select name="installmentCount"><option value="1">A vista (1x)</option><option value="2">2 parcelas</option><option value="3">3 parcelas</option><option value="4">4 parcelas</option><option value="5">5 parcelas</option><option value="6">6 parcelas</option><option value="10">10 parcelas</option></select>';
    document.querySelector("#invoicePreview").before(label);
  }
  const payDialog = document.querySelector("#payInvoiceDialog");
  const payForm = document.querySelector("#payInvoiceForm");
  const monthInput = document.querySelector("#invoiceMonth");
  monthInput.value = currentMonth();
  document.querySelector("#newCard").addEventListener("click", () => openCardEditor());
  document.querySelector("#newPurchase").addEventListener("click", () => openPurchase());
  document.querySelector("#creditCardList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "new-card") return openCardEditor();
    const card = cards.find((item) => item.id === button.dataset.card);
    if (!card) return;
    if (button.dataset.action === "buy") return openPurchase(card.id);
    if (button.dataset.action === "edit") return openCardEditor(card);
    if (button.dataset.action === "archive") {
      const active = !card.active;
      if (!window.confirm(active ? `Reativar ${card.name}?` : `Arquivar ${card.name}? As faturas em aberto continuarão disponíveis para pagamento.`)) return;
      button.disabled = true;
      try { await updateCreditCard(user.uid, card.id, { active }); await reload(); showToast(active ? "Cartão reativado." : "Cartão arquivado."); }
      catch (error) { showToast(explainError(error)); }
    }
  });
  document.querySelector("#invoiceList").addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="pay-invoice"]');
    if (!button) return;
    const card = cards.find((item) => item.id === button.dataset.card);
    const invoice = card?.invoices.find((item) => item.id === button.dataset.invoice);
    if (card && invoice) openInvoicePayment(card, invoice);
  });
  monthInput.addEventListener("change", () => renderInvoices());
  purchaseForm.elements.cardId.addEventListener("change", updateInvoicePreview);
  purchaseForm.elements.date.addEventListener("change", updateInvoicePreview);
  purchaseForm.elements.amount.addEventListener("input", updateInvoicePreview);
  purchaseForm.elements.installmentCount.addEventListener("change", updateInvoicePreview);
  document.querySelectorAll(".card-close").forEach((button) => button.addEventListener("click", () => cardDialog.close()));
  document.querySelectorAll(".purchase-close").forEach((button) => button.addEventListener("click", () => purchaseDialog.close()));
  document.querySelectorAll(".pay-invoice-close").forEach((button) => button.addEventListener("click", () => payDialog.close()));
  cardForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(cardForm);
    const card = { name: String(data.get("name")).trim(), brand: String(data.get("brand")), lastFour: String(data.get("lastFour")).trim(), creditLimit: Number(data.get("creditLimit")), closingDay: Number(data.get("closingDay")), dueDay: Number(data.get("dueDay")) };
    if (!card.name || !card.creditLimit || card.creditLimit <= 0 || card.closingDay < 1 || card.closingDay > 28 || card.dueDay < 1 || card.dueDay > 28 || (card.lastFour && !/^\d{4}$/.test(card.lastFour))) return showToast("Confira o nome, limite, bandeira e os dias do cartão.");
    const button = cardForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (editingCardId) await updateCreditCard(user.uid, editingCardId, card);
      else await createCreditCard(user.uid, card);
      await reload(); cardDialog.close(); showToast(editingCardId ? "Cartão atualizado." : "Cartão cadastrado.");
    } catch (error) { showToast(explainError(error)); }
    finally { button.disabled = false; }
  });
  purchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(purchaseForm);
    const card = cards.find((item) => item.id === data.get("cardId"));
    const date = String(data.get("date"));
    const amount = Number(data.get("amount"));
    if (!card || !card.active || !date || date > todayKey() || !amount || amount <= 0) return showToast("Confira o cartão, a data e o valor da compra.");
    const installmentCount = Number(data.get("installmentCount") || 1);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 10) return showToast("Escolha um parcelamento entre 1 e 10 vezes.");
    const description = String(data.get("description")).trim();
    const category = String(data.get("category")).trim();
    const installments = buildInstallments(amount, date, card, installmentCount).map((item) => ({ ...item, description, category }));
    const invoiceMonth = installments[0].invoiceMonth;
    const purchase = { description, category, amount, date, invoiceMonth, dueDate: installments[0].dueDate, installments };
    if (!purchase.description || !purchase.category) return showToast("Informe a descricao e a categoria da compra.");    const button = purchaseForm.querySelector('[type="submit"]');
    button.disabled = true;
    try { await addCreditCardPurchase(user.uid, card, purchase); await reload(); purchaseDialog.close(); showToast(installmentCount > 1 ? `Compra parcelada em ${installmentCount} faturas.` : `Compra adicionada a fatura de ${monthLabel(invoiceMonth)}.`); }
    catch (error) { showToast(explainError(error)); }
    finally { button.disabled = false; }
  });
  payForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    const accountId = String(new FormData(payForm).get("accountId") || "");
    const paidDate = String(payForm.elements.paidDate.value);
    if (!paidDate || paidDate > todayKey() || (accounts.length && !accountId)) return showToast("Selecione a conta e confira a data do pagamento.");
    const button = payForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await payCreditCardInvoice(user.uid, selectedInvoice.card, selectedInvoice.invoice, accountId, paidDate);
      await reload(); payDialog.close(); showToast("Fatura paga e despesa registrada uma única vez."); selectedInvoice = null;
    } catch (error) { showToast(explainError(error)); }
    finally { button.disabled = false; }
  });
  getUserProfile(user).then((result) => {
    profile = result;
    money = currencyFormatter(profile.currency || "BRL");
    return reload();
  }).catch((error) => { document.querySelector("#creditCardList").innerHTML = `<div class="panel empty-transactions">${safe(firebaseErrorMessage(error))}</div>`; });
}
