import {
  firebaseErrorMessage,
  confirmCommitmentPayment,
  createCommitment,
  getCommitmentOccurrences,
  getCommitments,
  getNotifications,
  getTransactions,
  getUserProfile,
  logOut,
  markNotificationRead,
  saveTransaction,
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
let toastTimer;

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

async function loadDashboard(user) {
  rows.innerHTML = '<tr><td colspan="4" class="empty-transactions">Carregando movimentações...</td></tr>';
  try {
    const [transactions, commitments, profile] = await Promise.all([getTransactions(user.uid), getCommitments(user.uid), getUserProfile(user)]);
    if (activeUser?.uid !== user.uid) return;
    money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: profile.currency || 'BRL' });
    profileTimeZone = profile.timeZone || 'America/Sao_Paulo';
    document.querySelector('#profileName').textContent = profile.name;
    document.querySelector('#greeting').firstChild.textContent = `Olá, ${profile.name} `;
    const occurrences = await getCommitmentOccurrences(user.uid, commitments);
    if (activeUser?.uid !== user.uid) return;
    currentTransactions = transactions;
    currentCommitments = commitments;
    currentOccurrences = occurrences;
    renderTransactions(transactions);
    renderFinanceSummary(transactions, occurrences);
    renderCommitments(occurrences);
    refreshNotificationIndicator(user);
  } catch (error) {
    rows.innerHTML = '<tr><td colspan="4" class="empty-transactions">Não foi possível carregar seus dados financeiros.</td></tr>';
    showToast(firebaseErrorMessage(error));
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
      return `<tr><td><span class="transaction-icon ${income ? 'salary' : 'market'}">${income ? '↙' : '↗'}</span><span class="row-title">${escapeHtml(item.description)}</span><small>Na sua conta</small></td><td><span class="category-pill">${escapeHtml(item.category)}</span></td><td>${date}</td><td class="${income ? 'value-positive' : 'value-negative'}">${income ? '+' : '−'} ${money.format(item.amount)}</td></tr>`;
    }).join('');
}

function renderFinanceSummary(transactions, occurrences) {
  const [year, month, day] = todayKey().split('-').map(Number);
  const now = new Date(year, month - 1, day, 12);
  document.querySelector('.page-heading .eyebrow').innerHTML = `<span class="live-dot"></span> ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toLocaleUpperCase('pt-BR')}`;
  const monthKey = todayKey().slice(0, 7);
  const monthTransactions = transactions.filter(item => item.date.startsWith(monthKey));
  const sum = (items, type) => items.filter(item => item.type === type).reduce((total, item) => total + item.amount, 0);
  const income = sum(monthTransactions, 'income');
  const expenses = sum(monthTransactions, 'expense');
  const allTimeBalance = sum(transactions, 'income') - sum(transactions, 'expense');
  const pending = occurrences.filter(item => item.status === 'pending');
  const cards = document.querySelectorAll('.summary-card');
  cards[0].querySelector('.amount').textContent = money.format(allTimeBalance);
  cards[0].querySelector('.card-foot').innerHTML = '<span>saldo líquido</span><span>das movimentações registradas</span>';
  cards[1].querySelector('.amount').textContent = money.format(income);
  cards[2].querySelector('.amount').textContent = money.format(expenses);
  cards[3].querySelector('.amount').textContent = money.format(pending.reduce((total, item) => total + item.amount, 0));
  cards[1].querySelector('.card-foot').innerHTML = '<span>registros deste mês</span>';
  cards[2].querySelector('.card-foot').innerHTML = '<span>registros deste mês</span>';
  cards[3].querySelector('.card-foot').innerHTML = `<span class="pending-tag">${pending.length} pendente${pending.length === 1 ? '' : 's'}</span><span>sem baixa automática</span>`;
  const nextPending = pending.filter(item => item.dueDate >= todayKey()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const nextDueText = document.querySelector('.due-dots span');
  if (nextDueText) nextDueText.textContent = nextPending ? `Próximo vencimento: ${new Date(`${nextPending.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Nenhum próximo vencimento';

  const months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1));
  const totals = months.map(date => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const records = transactions.filter(item => item.date.startsWith(key));
    return { income: sum(records, 'income'), expense: sum(records, 'expense') };
  });
  const maxValue = Math.max(1, ...totals.flatMap(item => [item.income, item.expense]));
  document.querySelectorAll('.month-bars').forEach((group, index) => {
    group.querySelector('.income').style.height = `${Math.max(3, totals[index].income / maxValue * 100)}%`;
    group.querySelector('.expense').style.height = `${Math.max(3, totals[index].expense / maxValue * 100)}%`;
  });
  document.querySelectorAll('.x-labels span').forEach((label, index) => {
    label.textContent = months[index].toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  });
  const monthBalance = income - expenses;
  const chartBalance = document.querySelector('.chart-legend strong b');
  if (chartBalance) chartBalance.textContent = money.format(monthBalance);
  const chartTitle = document.querySelector('.chart-legend strong');
  if (chartTitle?.firstChild) chartTitle.firstChild.textContent = 'Resultado do mês ';
  const axisTop = Math.ceil(maxValue / 3 / 1000) * 3000 || 3000;
  document.querySelectorAll('.y-labels span').forEach((label, index) => {
    const value = axisTop * (3 - index) / 3;
    label.textContent = value === 0 ? '0' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 0 }).format(value);
  });
  const notice = document.querySelector('.demo-notice');
  notice.innerHTML = '<span>&#9432;</span> Saldo e movimentações usam seus registros. A automação dos próximos vencimentos depende de publicar a Cloud Function. Metas ainda são demonstrativas.';
}

function renderCommitments(occurrences) {
  const list = document.querySelector('#commitmentList');
  const today = todayKey();
  const visible = occurrences.filter(item => item.status === 'pending' || item.dueDate >= today).slice(0, 6);
  if (!visible.length) {
    list.innerHTML = '<div class="empty-transactions">Nenhum vencimento previsto. Crie um compromisso para começar.</div>';
    return;
  }
  list.innerHTML = visible.map(item => {
    const due = new Date(`${item.dueDate}T12:00:00`);
    const dateParts = due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').split(' ');
    const overdue = item.status === 'pending' && item.dueDate < today;
    const status = item.status === 'paid' ? '<span class="commitment-status paid-status">Pago</span>' : overdue ? '<span class="commitment-status overdue-status">Pendente em atraso</span>' : '<span class="commitment-status">Pendente</span>';
    const action = item.status === 'pending' ? `<button class="confirm-payment" type="button" data-commitment="${escapeHtml(item.commitmentId)}" data-occurrence="${escapeHtml(item.id)}">Confirmar pagamento</button>` : '';
    const displayedAmount = item.status === 'paid' ? item.paidAmount : item.amount;
    return `<div class="commitment"><div class="date-box"><b>${dateParts[0]}</b><small>${dateParts[1]}</small></div><div class="commitment-name"><b>${escapeHtml(item.commitmentName || item.name)}</b><small>${escapeHtml(item.commitmentCategory || item.category)} · ${status}</small></div><strong>${money.format(displayedAmount)}</strong>${action}</div>`;
  }).join('');
}

export function mountDashboardPage(user) {
  activeUser = user;
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
  form.elements.date.value = todayKey();
  form.elements.date.max = todayKey();
  dialog.showModal();
});
document.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', () => dialog.close()));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeUser) return showToast('Entre na sua conta para registrar movimentações.');
  const data = new FormData(form);
  const transaction = {
    type: String(data.get('type')),
    description: String(data.get('description')).trim(),
    amount: Number(data.get('amount')),
    category: String(data.get('category')).trim(),
    date: String(data.get('date')),
  };
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
  if (!window.confirm(`Confirmar pagamento de ${money.format(paidAmount)}? Uma despesa será registrada na mesma operação.`)) return;
  button.disabled = true;
  try {
    await confirmCommitmentPayment(activeUser.uid, occurrence, paidAmount, profileTimeZone);
    await loadDashboard(activeUser);
    showToast('Pagamento confirmado e registrado uma única vez.');
  } catch (error) {
    showToast(error.message?.startsWith('Esta conta') ? error.message : firebaseErrorMessage(error));
  }
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

document.querySelector('#addGoal').addEventListener('click', () => showToast('O cadastro de metas será desenvolvido na próxima etapa.'));
document.querySelector('#periodButton').addEventListener('click', () => showToast('O filtro de períodos será implementado com os relatórios.'));
document.querySelector('#chartPeriod').addEventListener('click', () => showToast('O gráfico mostra suas receitas e despesas dos últimos seis meses.'));
document.querySelector('#menuToggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
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
  mobileMore.setAttribute('aria-expanded', String(open));
});
}
