import {
  firebaseErrorMessage,
  confirmCommitmentPayment,
  createCommitment,
  getCommitmentOccurrences,
  getCommitments,
  getNotifications,
  getAccounts,
  getCreditCards,
  getGoals,
  getTransfers,
  getTransactions,
  getUserProfile,
  logOut,
  markNotificationRead,
  saveTransaction,
  addCreditCardPurchase,
} from "../../services/firebase/firebase.js";

let dialog;
let form;
let toast;
let rows;
let money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let profileTimeZone = 'America/Sao_Paulo';
let activeUser = null;
let currentTransactions = [];
let currentCommitments = [];
let currentOccurrences = [];
let currentAccounts = [];
let currentCreditCards = [];
let currentTransfers = [];
let toastTimer;

document.addEventListener('pointerdown', (event) => {
  const sidebar = document.querySelector('#sidebar');
  const mobileMore = document.querySelector('#mobileMore');
  if (!sidebar?.classList.contains('open') || sidebar.contains(event.target) || mobileMore?.contains(event.target)) return;
  sidebar.classList.remove('open');
  document.body.classList.remove('mobile-sidebar-open');
  mobileMore?.setAttribute('aria-expanded', 'false');
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function initials(user) {
  const label = user.displayName || user.email || 'Orbe';
  return label.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: profileTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function dashboardRead(label, reader) {
  try {
    return await reader();
  } catch (cause) {
    const error = new Error(cause?.message || 'Falha na leitura do Firestore.', { cause });
    error.code = cause?.code || 'unknown';
    error.dashboardOperation = label;
    throw error;
  }
}

async function loadDashboard(user) {
  rows.innerHTML = '<tr><td colspan="4" class="empty-transactions">Carregando movimentações...</td></tr>';
  try {
    const [transactions, commitments, profile] = await Promise.all([
      dashboardRead('movimentações (users/{uid}/transactions)', () => getTransactions(user.uid)),
      dashboardRead('compromissos (users/{uid}/commitments)', () => getCommitments(user.uid)),
      dashboardRead('perfil (users/{uid})', () => getUserProfile(user)),
    ]);
    if (activeUser?.uid !== user.uid) return;
    let accounts = [];
    let transfers = [];
    try {
      [accounts, transfers] = await Promise.all([
        dashboardRead('contas (users/{uid}/accounts)', () => getAccounts(user.uid)),
        dashboardRead('transferências (users/{uid}/transfers)', () => getTransfers(user.uid)),
      ]);
    } catch (error) {
      console.error('[Orbe] Falha ao carregar contas/transferências:', error);
      showToast(firebaseErrorMessage(error));
    }
    if (activeUser?.uid !== user.uid) return;
    money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: profile.currency || 'BRL' });
    profileTimeZone = profile.timeZone || 'America/Sao_Paulo';
    document.querySelector('#profileName').textContent = profile.name;
    document.querySelector('#greeting').firstChild.textContent = `Olá, ${profile.name} `;
    const occurrences = await getCommitmentOccurrences(user.uid, commitments);
    let goals = [];
    try {
      goals = await dashboardRead('metas (users/{uid}/goals)', () => getGoals(user.uid));
    } catch (error) {
      console.warn('[Orbe] Não foi possível carregar metas na Visão geral:', error);
    }
    let creditCards = [];
    try {
      creditCards = await dashboardRead('cartões (users/{uid}/creditCards)', () => getCreditCards(user.uid));
    } catch (error) {
      console.warn('[Orbe] Não foi possível carregar cartões na Visão geral:', error);
    }
    if (activeUser?.uid !== user.uid) return;
    currentTransactions = transactions;
    currentCommitments = commitments;
    currentAccounts = accounts;
    currentCreditCards = creditCards;
    currentTransfers = transfers;
    currentOccurrences = occurrences;
    renderTransactions(transactions);
    renderTransactionAccountOptions(accounts);
    renderTransactionCardOptions(creditCards);
    renderFinanceSummary(transactions, occurrences, accounts);
    renderCommitments(occurrences);
    renderGoalPreview(goals);
    refreshNotificationIndicator(user);
  } catch (error) {
    rows.innerHTML = '<tr><td colspan="4" class="empty-transactions">Não foi possível carregar seus dados financeiros.</td></tr>';
    showToast(firebaseErrorMessage(error));
  }
}

function renderGoalPreview(goals) {
  const preview = document.querySelector('#dashboardGoals');
  if (!preview) return;
  const active = goals.filter(goal => goal.active !== false).slice(0, 2);
  if (!active.length) {
    preview.innerHTML = '<p class="goal-preview-empty">Crie sua primeira meta e acompanhe o progresso por aqui.</p>';
    return;
  }
  preview.innerHTML = active.map((goal, index) => {
    const saved = (goal.deposits || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const target = Number(goal.targetAmount || 0);
    const progress = target ? Math.min(100, saved / target * 100) : 0;
    return `<div class="goal-main ${index ? 'second-goal' : ''}"><div class="goal-icon ${index ? 'home' : 'beach'}">◎</div><div class="goal-details"><b>${escapeHtml(goal.name)}</b><span>${money.format(saved)} <small>de ${money.format(target)}</small></span><div class="progress-track ${index ? 'purple' : ''}"><i style="width:${progress}%"></i></div><small>${progress.toFixed(0)}% concluído</small></div></div>`;
  }).join('');
}

function renderTransactionAccountOptions(accounts) {
  let select = form.elements.accountId;
  if (!select) {
    const label = document.createElement('label');
    label.id = 'transactionAccountField';
    label.innerHTML = 'Conta ou carteira<select name="accountId"></select>';
    select = label.querySelector('select');
    form.querySelector('.form-note').before(label);
  }
  const active = accounts.filter(account => account.active);
  select.innerHTML = active.length
    ? `<option value="">Selecione uma conta</option>${active.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('')}`
    : '<option value="">Sem conta vinculada</option>';
  select.required = active.length > 0;
  select.onchange = () => {
    const selected = active.find(account => account.id === select.value);
    form.elements.date.min = selected?.openingDate || '';
  };
  updateTransactionMode();
}

function renderTransactionCardOptions(cards) {
  const select = form.elements.cardId;
  if (!select) return;
  if (!form.elements.installmentCount) {
    const label = document.createElement('label');
    label.id = 'transactionInstallmentField';
    label.innerHTML = 'Parcelamento<select name="installmentCount"><option value="1">À vista (1x)</option><option value="2">2 parcelas</option><option value="3">3 parcelas</option><option value="4">4 parcelas</option><option value="5">5 parcelas</option><option value="6">6 parcelas</option><option value="10">10 parcelas</option></select>';
    document.querySelector('#transactionInvoicePreview').before(label);
  }
  const active = cards.filter(card => card.active);
  select.innerHTML = active.length
    ? `<option value="">Selecione um cartão</option>${active.map(card => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)} · ${escapeHtml(card.brand || 'Cartão')}${card.lastFour ? ` · final ${escapeHtml(card.lastFour)}` : ''}</option>`).join('')}`
    : '<option value="">Nenhum cartão ativo cadastrado</option>';
  updateTransactionMode();
}

function updateTransactionMode() {
  if (!form?.elements.type) return;
  const isCardPurchase = form.elements.type.value === 'card-purchase';
  const accountField = document.querySelector('#transactionAccountField');
  const cardField = document.querySelector('#transactionCardField');
  const installmentField = document.querySelector('#transactionInstallmentField');
  const preview = document.querySelector('#transactionInvoicePreview');
  if (accountField) accountField.hidden = isCardPurchase;
  if (cardField) cardField.hidden = !isCardPurchase;
  if (installmentField) installmentField.hidden = !isCardPurchase;
  if (preview) preview.hidden = !isCardPurchase;
  if (form.elements.accountId) form.elements.accountId.required = !isCardPurchase && currentAccounts.some(account => account.active);
  if (form.elements.cardId) form.elements.cardId.required = isCardPurchase;
  updateTransactionInvoicePreview();
}

function invoiceMonthFor(date, closingDay) {
  const [year, month, day] = date.split('-').map(Number);
  const invoiceDate = new Date(year, month - 1 + (day > closingDay ? 1 : 0), 1);
  return `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
}

function invoiceDueDate(invoiceMonth, closingDay, dueDay) {
  const [year, month] = invoiceMonth.split('-').map(Number);
  const dueMonth = new Date(year, month - 1 + (dueDay <= closingDay ? 1 : 0), 1);
  return `${dueMonth.getFullYear()}-${String(dueMonth.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
}

function buildInstallments(total, date, card, count) {
  const firstMonth = invoiceMonthFor(date, card.closingDay);
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const extraCents = totalCents % count;
  const [year, month] = firstMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const invoiceDate = new Date(year, month - 1 + index, 1);
    const invoiceMonth = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
    return {
      amount: (base + (index < extraCents ? 1 : 0)) / 100,
      date,
      invoiceMonth,
      dueDate: invoiceDueDate(invoiceMonth, card.closingDay, card.dueDay),
      ...(count > 1 ? { installmentNumber: index + 1, installmentCount: count } : {}),
    };
  });
}

function updateTransactionInvoicePreview() {
  const preview = document.querySelector('#transactionInvoicePreview');
  const date = form?.elements.date?.value;
  const amount = Number(form?.elements.amount?.value || 0);
  const count = Number(form?.elements.installmentCount?.value || 1);
  const card = currentCreditCards.find(item => item.id === form?.elements.cardId?.value && item.active);
  if (!preview || !card || !date) {
    if (preview) preview.textContent = currentCreditCards.some(item => item.active)
      ? 'Escolha um cartao para ver a previsao da fatura.'
      : 'Cadastre um cartao de credito na area Cartoes para registrar compras por aqui.';
    return;
  }
  const installments = buildInstallments(amount, date, card, count);
  const first = installments[0];
  const last = installments.at(-1);
  if (count > 1) {
    preview.innerHTML = `Compra parcelada em <strong>${count}x de ${money.format(first.amount)}</strong>. Primeira parcela na fatura de <strong>${escapeHtml(monthName(first.invoiceMonth))}</strong> e ultima na de <strong>${escapeHtml(monthName(last.invoiceMonth))}</strong>. O saldo da conta nao muda agora.`;
  } else {
    const dueDate = invoiceDueDate(first.invoiceMonth, card.closingDay, card.dueDay);
    preview.innerHTML = `Vai para a fatura de <strong>${escapeHtml(monthName(first.invoiceMonth))}</strong>, com vencimento em <strong>${new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</strong>. O saldo da conta nao muda agora.`;
  }
}
async function refreshNotificationIndicator(user) {
  try {
    const notifications = await getNotifications(user.uid);
    if (activeUser?.uid !== user.uid) return;
    const unread = notifications.filter(item => !item.read).length;
    const dot = document.querySelector('.notification-button i');
    dot.hidden = unread === 0;
    document.querySelector('.notification-button').title = unread ? `${unread} lembrete(s) não lido(s)` : 'Notificações';
  } catch {
    // O painel financeiro continua disponível se a consulta de lembretes falhar.
  }
}

function renderTransactions(transactions) {
  if (!transactions.length) {
    rows.innerHTML = '<tr><td colspan="4" class="empty-transactions">Nenhuma movimentação registrada. Use “Nova movimentação” para começar.</td></tr>';
    return;
  }
  rows.innerHTML = transactions.slice(0, 8).map(item => {
      const date = new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
      const income = item.type === 'income';
      const accountName = currentAccounts.find(account => account.id === item.accountId)?.name || 'Sem conta vinculada';
      return `<tr><td><span class="transaction-icon ${income ? 'salary' : 'market'}">${income ? '↙' : '↗'}</span><span class="row-title">${escapeHtml(item.description)}</span><small>${escapeHtml(accountName)}</small></td><td><span class="category-pill">${escapeHtml(item.category)}</span></td><td>${date}</td><td class="${income ? 'value-positive' : 'value-negative'}">${income ? '+' : '−'} ${money.format(item.amount)}</td></tr>`;
    }).join('');
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthName(key, options = { month: 'long', year: 'numeric' }) {
  return new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', options);
}

function setupSummaryControls(now) {
  const period = document.querySelector('#periodButton');
  if (period.tagName !== 'SELECT') {
    const select = document.createElement('select');
    select.id = period.id;
    select.className = period.className;
    select.setAttribute('aria-label', 'Período do resumo');
    for (let offset = 0; offset < 12; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const option = document.createElement('option');
      option.value = monthKey(date);
      option.textContent = offset === 0 ? 'Este mês' : monthName(option.value);
      select.append(option);
    }
    period.replaceWith(select);
    select.addEventListener('change', () => renderFinanceSummary(currentTransactions, currentOccurrences, currentAccounts));
  }
  const range = document.querySelector('#chartPeriod');
  if (range.tagName !== 'SELECT') {
    const select = document.createElement('select');
    select.id = range.id;
    select.className = range.className;
    select.setAttribute('aria-label', 'Período do gráfico');
    select.innerHTML = '<option value="6">Últimos 6 meses</option><option value="12">Últimos 12 meses</option>';
    range.replaceWith(select);
    select.addEventListener('change', () => renderCashflowChart(currentTransactions, Number(select.value)));
  }
  document.querySelectorAll('.summary-card').forEach((card, index) => {
    card.classList.toggle('income-summary', index === 1);
    card.classList.toggle('expense-summary', index === 2);
    card.classList.toggle('pending-summary', index === 3);
    card.querySelector('.balance-spark, .mini-bars, .due-dots')?.remove();
  });
}

function renderFinanceSummary(transactions, occurrences, accounts = []) {
  const [year, month, day] = todayKey().split('-').map(Number);
  const now = new Date(year, month - 1, day, 12);
  document.querySelector('.page-heading .eyebrow').innerHTML = `<span class="live-dot"></span> ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toLocaleUpperCase('pt-BR')}`;
  setupSummaryControls(now);
  const selectedMonth = document.querySelector('#periodButton').value || todayKey().slice(0, 7);
  const monthTransactions = transactions.filter(item => item.date?.startsWith(selectedMonth));
  const sum = (items, type) => items.filter(item => item.type === type).reduce((total, item) => total + item.amount, 0);
  const income = sum(monthTransactions, 'income');
  const expenses = sum(monthTransactions, 'expense');
  const unassignedBalance = accounts.length ? 0 : transactions.filter(item => !item.accountId).reduce((total, item) => total + (item.type === 'income' ? item.amount : -item.amount), 0);
  const accountBalance = accounts.reduce((total, account) => {
    const since = account.openingDate || '0000-00-00';
    const movementTotal = transactions.filter(item => item.accountId === account.id && item.date >= since)
      .reduce((value, item) => value + (item.type === 'income' ? item.amount : -item.amount), 0);
    const transferTotal = currentTransfers.filter(item => item.date >= since)
      .reduce((value, item) => value + (item.toAccountId === account.id ? item.amount : item.fromAccountId === account.id ? -item.amount : 0), 0);
    return total + (account.openingBalance || 0) + movementTotal + transferTotal;
  }, 0);
  const pending = occurrences.filter(item => item.status === 'pending' && item.dueDate?.startsWith(selectedMonth));
  const cards = document.querySelectorAll('.summary-card');
  cards[0].querySelector('.amount').textContent = money.format(accountBalance + unassignedBalance);
  cards[0].querySelector('.card-foot').innerHTML = '<span>saldo atual das contas e movimentações</span>';
  cards[1].querySelector('.amount').textContent = money.format(income);
  cards[2].querySelector('.amount').textContent = money.format(expenses);
  cards[3].querySelector('.amount').textContent = money.format(pending.reduce((total, item) => total + item.amount, 0));
  cards[1].querySelector('.card-top span').textContent = `Receitas de ${monthName(selectedMonth)}`;
  cards[2].querySelector('.card-top span').textContent = `Despesas de ${monthName(selectedMonth)}`;
  cards[3].querySelector('.card-top span').textContent = `Pendências de ${monthName(selectedMonth)}`;
  cards[1].querySelector('.card-foot').innerHTML = `<span>${monthTransactions.filter(item => item.type === 'income').length} lançamento(s) confirmado(s)</span>`;
  cards[2].querySelector('.card-foot').innerHTML = `<span>${monthTransactions.filter(item => item.type === 'expense').length} lançamento(s) confirmado(s)</span>`;
  const nextPending = pending.filter(item => item.dueDate >= todayKey()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  cards[3].querySelector('.card-foot').innerHTML = `<span>${pending.length} compromisso(s) em aberto${nextPending ? ` · próximo ${new Date(`${nextPending.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</span>`;
  renderCashflowChart(transactions, Number(document.querySelector('#chartPeriod').value || 6));
  const notice = document.querySelector('.demo-notice');
  notice.innerHTML = '<span>&#9432;</span> Saldo e movimentações usam seus registros. A automação dos próximos vencimentos depende de publicar a Cloud Function.';
}

function renderCashflowChart(transactions, range = 6) {
  const today = todayKey().slice(0, 7);
  const end = new Date(`${today}-01T12:00:00`);
  const months = Array.from({ length: range }, (_, index) => new Date(end.getFullYear(), end.getMonth() - range + 1 + index, 1));
  const totals = months.map(date => {
    const key = monthKey(date);
    const records = transactions.filter(item => item.date?.startsWith(key));
    return { key, date, income: records.filter(item => item.type === 'income').reduce((value, item) => value + item.amount, 0), expense: records.filter(item => item.type === 'expense').reduce((value, item) => value + item.amount, 0) };
  });
  const maxValue = Math.max(1, ...totals.flatMap(item => [item.income, item.expense]));
  const chart = document.querySelector('.chart');
  const columns = chart.querySelector('.chart-columns');
  const labels = chart.querySelector('.x-labels');
  columns.innerHTML = totals.map(item => `<button type="button" class="month-bars" aria-label="${monthName(item.key)}: receitas ${money.format(item.income)}, despesas ${money.format(item.expense)}" data-month="${item.key}"><i class="income" style="height:${item.income ? item.income / maxValue * 100 : 0}%"></i><i class="expense" style="height:${item.expense ? item.expense / maxValue * 100 : 0}%"></i></button>`).join('');
  labels.innerHTML = totals.map(item => `<span>${item.date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>`).join('');
  chart.classList.toggle('chart-twelve-months', range === 12);
  chart.setAttribute('aria-label', `Gráfico de receitas e despesas dos últimos ${range} meses`);
  chart.removeAttribute('role');
  const rawStep = maxValue / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const axisTop = Math.ceil(rawStep / magnitude) * magnitude * 3;
  document.querySelectorAll('.y-labels span').forEach((label, index) => {
    const value = axisTop * (3 - index) / 3;
    label.textContent = value === 0 ? '0' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 0 }).format(value);
  });
  const showMonth = item => {
    columns.querySelectorAll('.month-bars').forEach(bar => bar.classList.toggle('selected', bar.dataset.month === item.key));
    document.querySelector('.chart-legend strong').innerHTML = `Resultado de ${monthName(item.key, { month: 'short', year: 'numeric' })}<b>${money.format(item.income - item.expense)}</b>`;
    document.querySelector('.chart-caption span').textContent = `${monthName(item.key)} · Receitas ${money.format(item.income)} · Despesas ${money.format(item.expense)}`;
  };
  columns.querySelectorAll('.month-bars').forEach((bar, index) => bar.addEventListener('click', () => showMonth(totals[index])));
  showMonth(totals[totals.length - 1]);
}
function renderCommitments(occurrences) {
  const list = document.querySelector('#commitmentList');
  const today = todayKey();
  const visible = occurrences.filter(item => item.status !== 'skipped' && (item.status === 'pending' || item.dueDate >= today)).slice(0, 6);
  if (!visible.length) {
    list.innerHTML = '<div class="empty-transactions">Nenhum vencimento previsto. Crie um compromisso para começar.</div>';
    return;
  }
  list.innerHTML = visible.map(item => {
    const due = new Date(`${item.dueDate}T12:00:00`);
    const dateParts = due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').split(' ');
    const overdue = item.status === 'pending' && item.dueDate < today;
    const status = item.status === 'paid' ? '<span class="commitment-status paid-status">Pago</span>' : overdue ? '<span class="commitment-status overdue-status">Pendente em atraso</span>' : '<span class="commitment-status">Pendente</span>';
    const action = item.status === 'pending' ? '<a class="confirm-payment" href="#compromissos" data-page="compromissos">Abrir checklist</a>' : '';
    const displayedAmount = item.status === 'paid' ? item.paidAmount : item.amount;
    return `<div class="commitment"><div class="date-box"><b>${dateParts[0]}</b><small>${dateParts[1]}</small></div><div class="commitment-name"><b>${escapeHtml(item.commitmentName || item.name)}</b><small>${escapeHtml(item.commitmentCategory || item.category)} · ${status}</small></div><strong>${money.format(displayedAmount)}</strong>${action}</div>`;
  }).join('');
}

export function mountDashboardPage(user) {
  activeUser = user;
  currentAccounts = [];
  currentTransfers = [];
  dialog = document.querySelector('#transactionDialog');
  form = document.querySelector('#transactionForm');
  toast = document.querySelector('#toast');
  rows = document.querySelector('#transactionRows');
  const name = user.displayName || user.email?.split('@')[0] || 'Minha conta';
  document.querySelector('#profileName').textContent = name;
  document.querySelector('#profileEmail').textContent = user.email || 'Conta pessoal';
  document.querySelector('#profileInitials').textContent = initials(user);
  document.querySelector('.top-avatar').textContent = initials(user);
  document.querySelector('#greeting').firstChild.textContent = `Olá, ${name} `;
  loadDashboard(user);
document.querySelector('#signOut').addEventListener('click', async () => {
  try { await logOut(); }
  catch (error) { showToast(firebaseErrorMessage(error)); }
});

document.querySelector('#addTransaction').addEventListener('click', () => {
  if (!activeUser) return showToast('Entre na sua conta para registrar movimentações.');
  form.reset();
  form.elements.type.value = 'expense';
  form.elements.date.value = todayKey();
  form.elements.date.max = todayKey();
  const firstAccount = currentAccounts.find(account => account.active);
  if (firstAccount) {
    form.elements.accountId.value = firstAccount.id;
    form.elements.date.min = firstAccount.openingDate || '';
  } else {
    form.elements.date.min = '';
  }
  const firstCard = currentCreditCards.find(card => card.active);
  if (firstCard) form.elements.cardId.value = firstCard.id;
  updateTransactionMode();
  dialog.showModal();
});
document.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', () => dialog.close()));
form.elements.type.addEventListener('change', updateTransactionMode);
form.elements.cardId.addEventListener('change', updateTransactionInvoicePreview);
form.elements.date.addEventListener('change', updateTransactionInvoicePreview);
form.addEventListener('input', event => {
  if (['amount', 'installmentCount'].includes(event.target.name)) updateTransactionInvoicePreview();
});
form.addEventListener('change', event => {
  if (event.target.name === 'installmentCount') updateTransactionInvoicePreview();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUser) return showToast('Entre na sua conta para registrar movimentações.');
  const data = new FormData(form);
  const movementType = String(data.get('type'));
  const transaction = {
    type: movementType === 'income' ? 'income' : 'expense',
    description: String(data.get('description')).trim(),
    amount: Number(data.get('amount')),
    category: String(data.get('category')).trim(),
    date: String(data.get('date')),
  };
  if (movementType === 'card-purchase') {
    const card = currentCreditCards.find(item => item.id === String(data.get('cardId')) && item.active);
    if (!card) return showToast('Selecione um cartão ativo para registrar a compra.');
    if (!transaction.description || !transaction.category || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || !transaction.date || transaction.date > todayKey()) return showToast('Confira os dados e registre somente compras já realizadas.');
    const installmentCount = Number(data.get('installmentCount') || 1);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 10) return showToast('Escolha um parcelamento entre 1 e 10 vezes.');
    const installments = buildInstallments(transaction.amount, transaction.date, card, installmentCount).map(item => ({
      ...item,
      description: transaction.description,
      category: transaction.category,
    }));
    const invoiceMonth = installments[0].invoiceMonth;
    const purchase = {
      description: transaction.description,
      category: transaction.category,
      amount: transaction.amount,
      date: transaction.date,
      invoiceMonth,
      dueDate: installments[0].dueDate,
      installments,
    };    const saveButton = form.querySelector('[type="submit"]');
    saveButton.disabled = true;
    try {
      await addCreditCardPurchase(activeUser.uid, card, purchase);
      await loadDashboard(activeUser);
      dialog.close();
      showToast(installmentCount > 1 ? `Compra parcelada registrada em ${installmentCount} faturas.` : `Compra registrada na fatura de ${monthName(invoiceMonth)}.`);
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    } finally {
      saveButton.disabled = false;
    }
    return;
  }
  const accountId = String(data.get('accountId') || '');
  if (accountId) transaction.accountId = accountId;
  if (currentAccounts.some(account => account.active) && !currentAccounts.some(account => account.id === accountId && account.active)) return showToast('Selecione uma conta ou carteira ativa.');
  const selectedAccount = currentAccounts.find(account => account.id === accountId);
  if (selectedAccount && transaction.date < selectedAccount.openingDate) return showToast('A data da movimentação deve ser igual ou posterior à data inicial da conta.');
  if (!transaction.description || !transaction.category || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || !transaction.date || transaction.date > todayKey()) return showToast('Registre somente movimentações já realizadas.');
  const saveButton = form.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    await saveTransaction(activeUser.uid, transaction);
    await loadDashboard(activeUser);
    dialog.close();
    showToast('Movimentação salva na sua conta Firebase.');
  } catch (error) {
    showToast(firebaseErrorMessage(error));
  } finally {
    saveButton.disabled = false;
  }
});

const commitmentDialog = document.querySelector('#commitmentDialog');
const commitmentForm = document.querySelector('#commitmentForm');
document.querySelector('#addCommitment').addEventListener('click', () => {
  if (!activeUser) return showToast('Entre na sua conta para cadastrar compromissos.');
  commitmentForm.reset();
  commitmentForm.elements.startDate.value = todayKey();
  commitmentDialog.showModal();
});
document.querySelectorAll('.commitment-close').forEach(button => button.addEventListener('click', () => commitmentDialog.close()));
commitmentForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUser) return showToast('Entre na sua conta para cadastrar compromissos.');
  const data = new FormData(commitmentForm);
  const startDate = String(data.get('startDate'));
  const endDate = String(data.get('endDate') || '') || null;
  const commitment = {
    name: String(data.get('name')).trim(),
    amount: Number(data.get('amount')),
    category: String(data.get('category')).trim(),
    frequency: String(data.get('frequency')),
    startDate,
    endDate,
  };
  if (!commitment.name || !commitment.category || !Number.isFinite(commitment.amount) || commitment.amount <= 0 || !startDate || (endDate && endDate < startDate)) {
    return showToast('Confira o nome, valor e período do compromisso.');
  }
  const saveButton = commitmentForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  try {
    await createCommitment(activeUser.uid, commitment);
    await loadDashboard(activeUser);
    commitmentDialog.close();
    showToast('Compromisso criado. O primeiro vencimento ficou pendente.');
  } catch (error) {
    showToast(firebaseErrorMessage(error));
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector('#commitmentList').addEventListener('click', async event => {
  const button = event.target.closest('[data-occurrence]');
  if (!button || !activeUser) return;
  const occurrence = currentOccurrences.find(item => item.id === button.dataset.occurrence && item.commitmentId === button.dataset.commitment);
  if (!occurrence) return showToast('Este vencimento não está disponível. Atualize a página.');
  const paidInput = window.prompt(`Valor efetivamente pago por “${occurrence.commitmentName || occurrence.name}” (R$):`, money.format(occurrence.amount).replace('R$', '').trim());
  if (paidInput === null) return;
  const paidAmount = Number(paidInput.trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount > 1000000000) return showToast('Informe um valor pago válido.');
  const activeAccounts = currentAccounts.filter(account => account.active);
  let paymentAccountId = '';
  if (activeAccounts.length) {
    const accountChoice = window.prompt(`Em qual conta registrar o pagamento?\n${activeAccounts.map((account, index) => `${index + 1}. ${account.name}`).join('\n')}`, '1');
    if (accountChoice === null) return;
    const selectedAccount = activeAccounts[Number(accountChoice) - 1];
    if (!selectedAccount) return showToast('Escolha o número de uma conta válida.');
    paymentAccountId = selectedAccount.id;
  }
  if (!window.confirm(`Confirmar pagamento de ${money.format(paidAmount)}? Uma despesa será registrada na mesma operação.`)) return;
  button.disabled = true;
  try {
    await confirmCommitmentPayment(activeUser.uid, occurrence, paidAmount, profileTimeZone, paymentAccountId);
    await loadDashboard(activeUser);
    showToast('Pagamento confirmado e registrado uma única vez.');
  } catch (error) {
    showToast(error.message?.startsWith('Esta conta') ? error.message : firebaseErrorMessage(error));
  }
});

const helpDialog = document.querySelector('#helpDialog');
document.querySelector('#helpButton').addEventListener('click', () => helpDialog.showModal());
helpDialog.querySelector('.help-close').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', event => {
  if (event.target === helpDialog) helpDialog.close();
});

document.querySelector('.notification-button').addEventListener('click', async () => {
  if (!activeUser) return;
  try {
    const notifications = await getNotifications(activeUser.uid);
    const unread = notifications.find(item => !item.read);
    if (!unread) return showToast(notifications.length ? 'Você já leu os lembretes recentes.' : 'Nenhum lembrete por enquanto.');
    await markNotificationRead(activeUser.uid, unread.id);
    refreshNotificationIndicator(activeUser);
    showToast(`${unread.title}: ${unread.body}`);
  } catch (error) {
    showToast(firebaseErrorMessage(error));
  }
});

document.querySelector('#addGoal').addEventListener('click', () => window.dispatchEvent(new CustomEvent('orbe:navigate', { detail: { page: 'metas' } })));
const sidebar = document.querySelector('#sidebar');
const sidebarExpand = document.querySelector('#sidebarExpand');
sidebarExpand.addEventListener('click', () => {
  const expanded = sidebar.classList.toggle('expanded');
  sidebarExpand.setAttribute('aria-expanded', String(expanded));
  sidebarExpand.setAttribute('aria-label', expanded ? 'Recolher navegação' : 'Expandir navegação');
  sidebarExpand.title = expanded ? 'Recolher navegação' : 'Abrir navegação';
});
const mobileMore = document.querySelector('#mobileMore');
mobileMore.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  document.body.classList.toggle('mobile-sidebar-open', open);
  mobileMore.setAttribute('aria-expanded', String(open));
});
}
