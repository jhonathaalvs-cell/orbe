import { createGoal, deleteGoal, firebaseErrorMessage, getGoals, recordGoalDeposit, updateGoal } from "../../services/firebase/firebase.js";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let user;
let goals = [];
let selectedGoalId = null;
let editingGoalId = null;
let toast;
let analysisTransition = 0;

function localDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function monthLabel(key, options = { month: "long", year: "numeric" }) { return new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", options); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function summarize(goal) {
  const deposits = goal.deposits || [];
  const saved = deposits.reduce((total, item) => total + Number(item.amount || 0), 0);
  const remaining = Math.max(0, Number(goal.targetAmount) - saved);
  const monthNumbers = deposits.map((item) => Number(item.date?.slice(0, 7).replace("-", ""))).filter(Boolean);
  const nowDate = new Date(`${localDateKey()}T12:00:00`);
  const firstMonth = monthNumbers.length ? monthNumbers.reduce((first, value) => Math.min(first, value)) : null;
  const elapsedMonths = firstMonth ? Math.max(1, (nowDate.getFullYear() - Math.floor(firstMonth / 100)) * 12 + nowDate.getMonth() + 1 - (firstMonth % 100)) : 0;
  const average = elapsedMonths ? saved / elapsedMonths : Number(goal.monthlyContribution || 0);
  const monthsToGoal = remaining === 0 ? 0 : average > 0 ? Math.ceil(remaining / average) : null;
  return { saved, remaining, average, monthsToGoal, usedPlan: !elapsedMonths && Number(goal.monthlyContribution || 0) > 0, progress: Math.min(100, Number(goal.targetAmount) ? saved / Number(goal.targetAmount) * 100 : 0) };
}

function renderOverview() {
  const active = goals.filter((goal) => goal.active !== false);
  const saved = active.reduce((sum, goal) => sum + summarize(goal).saved, 0);
  const target = active.reduce((sum, goal) => sum + Number(goal.targetAmount || 0), 0);
  document.querySelector("#goalOverview").innerHTML = `<article class="goal-overview-card"><span>Metas ativas</span><strong>${active.length}</strong></article><article class="goal-overview-card"><span>Total guardado nas metas</span><strong>${money.format(saved)}</strong></article><article class="goal-overview-card"><span>Valor total dos objetivos</span><strong>${money.format(target)}</strong></article>`;
}

function renderList() {
  const active = goals.filter((goal) => goal.active !== false);
  const list = document.querySelector("#goalsList");
  if (!active.length) {
    list.innerHTML = '<div class="panel goal-empty-list"><span>◎</span><h3>Sua primeira meta começa aqui</h3><p>Crie um objetivo e acompanhe cada depósito até chegar lá.</p><button class="button button-primary" data-action="new">Criar minha primeira meta</button></div>';
    document.querySelector("#goalAnalysis").innerHTML = '<div class="goal-analysis-empty"><span>◎</span><h2>Escolha uma meta</h2><p>Selecione uma meta para ver depósitos, mudanças de objetivo e previsões.</p></div>';
    return;
  }
  list.innerHTML = active.map((goal) => {
    const stats = summarize(goal);
    return `<article class="goal-card ${goal.id === selectedGoalId ? "is-selected" : ""}" data-goal="${goal.id}"><button class="goal-card-select" type="button" data-action="select" aria-label="Ver análise de ${escapeHtml(goal.name)}"><span class="goal-card-icon" style="--goal-progress:${stats.progress}%"><span>${stats.progress.toFixed(0)}%</span></span><span class="goal-card-main"><strong>${escapeHtml(goal.name)}</strong><small>${money.format(stats.saved)} guardados de ${money.format(goal.targetAmount)}</small><span class="goal-progress"><i style="width:${stats.progress}%"></i></span><small>${stats.progress.toFixed(0)}% concluído${goal.monthlyContribution ? ` · plano ${money.format(goal.monthlyContribution)}/mês` : ""}</small></span><span class="goal-card-arrow">›</span></button><div class="goal-card-actions"><button type="button" data-action="deposit">＋ Depositar</button><button type="button" data-action="edit">Editar meta</button><button type="button" class="goal-card-delete" data-action="delete"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m3 2v5m4-5v5"/></svg><span>Excluir</span></button></div></article>`;
  }).join("");
  if (!active.some((goal) => goal.id === selectedGoalId)) selectedGoalId = active[0].id;
  renderAnalysis();
}

function renderAnalysis() {
  const goal = goals.find((item) => item.id === selectedGoalId);
  const panel = document.querySelector("#goalAnalysis");
  if (!goal) return;
  const stats = summarize(goal);
  const deposits = [...(goal.deposits || [])].sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = new Map();
  for (const deposit of deposits) {
    const key = deposit.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) || 0) + Number(deposit.amount));
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
  const currentMonth = new Date(`${localDateKey()}T12:00:00`);
  const chartMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    return { key, value: byMonth.get(key) || 0 };
  });
  const chartMax = Math.max(1, ...chartMonths.map((item) => item.value));
  const projectedDate = stats.monthsToGoal === null ? null : new Date(new Date(`${localDateKey()}T12:00:00`).getFullYear(), new Date(`${localDateKey()}T12:00:00`).getMonth() + stats.monthsToGoal, 1);
  const pace = stats.average > 0 ? `<div class="forecast-card"><span>Previsão no ritmo atual</span><strong>${stats.monthsToGoal === 0 ? "Meta alcançada" : projectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong><small>${stats.usedPlan ? "Plano mensal de" : "Média real de"} ${money.format(stats.average)} por mês · faltam ${stats.monthsToGoal} ${stats.monthsToGoal === 1 ? "mês" : "meses"}</small></div>` : '<div class="forecast-card forecast-empty"><span>Previsão de conclusão</span><strong>Registre um depósito</strong><small>Com aportes reais calcularemos a média e uma data provável.</small></div>';
  const early = [5, 3].map((monthsEarlier) => {
    if (stats.monthsToGoal === null || stats.monthsToGoal <= monthsEarlier) return `<div><span>Concluir ${monthsEarlier} meses antes</span><strong>Prazo já é menor que ${monthsEarlier} meses</strong></div>`;
    const required = stats.remaining / (stats.monthsToGoal - monthsEarlier);
    return `<div><span>Concluir ${monthsEarlier} meses antes</span><strong>${money.format(required)} / mês</strong><small>Faltam ${stats.monthsToGoal - monthsEarlier} meses nesse ritmo</small></div>`;
  }).join("");
  const targetHistory = [...(goal.targetHistory || [])].reverse().map((entry) => `<li><span>${new Date(`${entry.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><strong>${money.format(entry.amount)}</strong></li>`).join("");
  panel.innerHTML = `<div class="analysis-hero"><div class="analysis-heading"><div><span class="eyebrow">ANÁLISE INDIVIDUAL</span><h2>${escapeHtml(goal.name)}</h2><p>Objetivo atual: ${money.format(goal.targetAmount)}</p></div><div class="analysis-actions"><button type="button" class="analysis-edit" data-action="edit">Editar</button><button type="button" class="analysis-delete" data-action="delete"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m3 2v5m4-5v5"/></svg>Excluir</button></div></div><div class="analysis-progress"><div class="analysis-progress-label"><strong>${money.format(stats.saved)}</strong><span>${money.format(stats.remaining)} restantes</span></div><div class="goal-progress"><i style="width:${stats.progress}%"></i></div><small>${stats.progress.toFixed(1)}% do objetivo alcançado</small></div></div><div class="forecast-grid">${pace}<div class="forecast-early"><h3>Para chegar antes</h3>${early}</div></div><div class="analysis-section"><div class="analysis-section-heading"><div><h3>Aportes ao longo do tempo</h3><p>Total depositado por mês</p></div></div>${months.length ? `<div class="deposit-chart">${chartMonths.map(({ key, value }) => `<div class="deposit-chart-column" title="${monthLabel(key)}: ${money.format(value)}"><div class="deposit-chart-track"><i style="height:${value ? Math.max(8, value / chartMax * 100) : 0}%"></i></div><span>${monthLabel(key, { month: "short" }).replace(".", "")}</span><strong>${value ? money.format(value) : "—"}</strong></div>`).join("")}</div>` : '<p class="analysis-empty-note">Ainda não há depósitos registrados.</p>'}</div><div class="analysis-section"><div class="analysis-section-heading"><div><h3>Histórico do valor alvo</h3><p>Veja quando e quanto o objetivo mudou</p></div></div>${targetHistory ? `<ul class="target-history">${targetHistory}</ul>` : '<p class="analysis-empty-note">O valor inicial continua sendo o alvo atual.</p>'}</div><div class="analysis-section"><div class="analysis-section-heading"><div><h3>Depósitos recentes</h3><p>Valores adicionados à meta</p></div><button type="button" class="analysis-deposit" data-action="deposit">＋ Depósito</button></div>${deposits.length ? `<div class="deposit-history">${deposits.slice(0, 8).map((item) => `<div><span class="deposit-history-icon">↗</span><span><strong>${money.format(item.amount)}</strong><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</small></span></div>`).join("")}</div>` : '<p class="analysis-empty-note">Seus depósitos aparecerão aqui.</p>'}</div>`;
}

function selectGoal(goalId) {
  if (goalId === selectedGoalId) return;
  const panel = document.querySelector("#goalAnalysis");
  const transitionId = ++analysisTransition;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!panel?.animate || reducedMotion) {
    selectedGoalId = goalId;
    return renderList();
  }
  panel.getAnimations().forEach((animation) => animation.cancel());
  const outgoing = panel.animate(
    [
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0)" },
      { opacity: 0, transform: "translate3d(-14px, 5px, 0) scale(.99)", filter: "blur(3px)" },
    ],
    { duration: 150, easing: "ease-in", fill: "forwards" },
  );
  outgoing.onfinish = () => {
    if (transitionId !== analysisTransition) return;
    outgoing.cancel();
    selectedGoalId = goalId;
    renderList();
    const incoming = panel.animate(
      [
        { opacity: 0, transform: "translate3d(18px, 9px, 0) scale(.985)", filter: "blur(4px)" },
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0)" },
      ],
      { duration: 390, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "both" },
    );
    incoming.onfinish = () => incoming.cancel();
  };
}

async function reload() {
  goals = await getGoals(user.uid);
  renderOverview();
  renderList();
}

function openEdit(goal) {
  editingGoalId = goal.id;
  const form = document.querySelector("#goalForm");
  form.reset();
  form.elements.name.value = goal.name;
  form.elements.targetAmount.value = goal.targetAmount;
  form.elements.monthlyContribution.value = goal.monthlyContribution || "";
  document.querySelector("#goalDialogEyebrow").textContent = "AJUSTE SEU OBJETIVO";
  document.querySelector("#goalDialogTitle").textContent = "Editar meta";
  document.querySelector("#goalDialog").showModal();
}

function openDeposit(goal) {
  const form = document.querySelector("#depositForm");
  form.reset();
  form.elements.date.value = localDateKey();
  form.elements.date.max = localDateKey();
  document.querySelector("#depositGoalName").textContent = goal.name;
  document.querySelector("#newTargetField").hidden = true;
  form.elements.newTargetAmount.required = false;
  document.querySelector("#depositDialog").dataset.goalId = goal.id;
  document.querySelector("#depositDialog").showModal();
}

export function mountGoalsPage(activeUser) {
  user = activeUser;
  toast = document.querySelector("#toast") || document.querySelector(".toast");
  const goalDialog = document.querySelector("#goalDialog");
  const goalForm = document.querySelector("#goalForm");
  const depositDialog = document.querySelector("#depositDialog");
  const depositForm = document.querySelector("#depositForm");
  document.querySelector("#createGoal").addEventListener("click", () => {
    editingGoalId = null;
    goalForm.reset();
    document.querySelector("#goalDialogEyebrow").textContent = "NOVO OBJETIVO";
    document.querySelector("#goalDialogTitle").textContent = "Criar meta";
    goalDialog.showModal();
  });
  goalDialog.querySelectorAll(".goal-close").forEach((button) => button.addEventListener("click", () => goalDialog.close()));
  depositDialog.querySelectorAll(".deposit-close").forEach((button) => button.addEventListener("click", () => depositDialog.close()));
  depositForm.elements.targetChanged.forEach((radio) => radio.addEventListener("change", () => {
    const changed = depositForm.elements.targetChanged.value === "yes";
    document.querySelector("#newTargetField").hidden = !changed;
    depositForm.elements.newTargetAmount.required = changed;
  }));
  goalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(goalForm);
    const name = String(data.get("name")).trim();
    const targetAmount = Number(data.get("targetAmount"));
    const monthlyValue = data.get("monthlyContribution");
    const monthlyContribution = monthlyValue ? Number(monthlyValue) : null;
    const date = localDateKey();
    const button = goalForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (editingGoalId) await updateGoal(user.uid, editingGoalId, { name, targetAmount, monthlyContribution, updatedDate: date });
      else await createGoal(user.uid, { name, targetAmount, monthlyContribution, createdDate: date, targetDate: null });
      await reload();
      goalDialog.close();
      showToast(editingGoalId ? "Meta atualizada." : "Meta criada.");
    } catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });
  depositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const goal = goals.find((item) => item.id === depositDialog.dataset.goalId);
    if (!goal) return showToast("Não encontramos essa meta. Atualize a página e tente novamente.");
    const data = new FormData(depositForm);
    const amount = Number(data.get("amount"));
    const date = String(data.get("date"));
    const note = String(data.get("note")).trim();
    const changeTarget = data.get("targetChanged") === "yes";
    const targetAmount = changeTarget ? Number(data.get("newTargetAmount")) : goal.targetAmount;
    if (!amount || amount <= 0 || !date || date > localDateKey() || !targetAmount || targetAmount <= 0) return showToast("Confira o valor e a data do depósito e o novo valor da meta.");
    const button = depositForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await recordGoalDeposit(user.uid, goal.id, { amount, date, ...(note ? { note } : {}) }, changeTarget ? targetAmount : null);
      selectedGoalId = goal.id;
      await reload();
      depositDialog.close();
      showToast(changeTarget && targetAmount !== goal.targetAmount ? "Depósito registrado e valor alvo atualizado." : "Depósito registrado.");
    } catch (error) { showToast(firebaseErrorMessage(error)); }
    finally { button.disabled = false; }
  });
  const deleteDialog = document.querySelector("#deleteGoalDialog");
  deleteDialog.querySelectorAll(".delete-goal-close").forEach((button) => button.addEventListener("click", () => deleteDialog.close()));
  deleteDialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = deleteDialog.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await deleteGoal(user.uid, deleteDialog.dataset.goalId);
      selectedGoalId = null;
      await reload();
      deleteDialog.close();
      showToast("Meta e depósitos excluídos.");
    } catch (error) {
      showToast(firebaseErrorMessage(error));
      try { await reload(); } catch { /* Mantém a confirmação aberta para nova tentativa. */ }
    } finally { button.disabled = false; }
  });
  document.querySelector("#goalsList").addEventListener("click", (event) => handleGoalAction(event));
  document.querySelector("#goalAnalysis").addEventListener("click", (event) => handleGoalAction(event));
  function handleGoalAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-goal]");
    const goal = goals.find((item) => item.id === (card?.dataset.goal || selectedGoalId));
    if (button.dataset.action === "new") return document.querySelector("#createGoal").click();
    if (!goal) return;
    if (button.dataset.action === "select") return selectGoal(goal.id);
    if (button.dataset.action === "deposit") return openDeposit(goal);
    if (button.dataset.action === "edit") return openEdit(goal);
    if (button.dataset.action === "delete") {
      const dialog = document.querySelector("#deleteGoalDialog");
      dialog.dataset.goalId = goal.id;
      document.querySelector("#deleteGoalName").textContent = goal.name;
      return dialog.showModal();
    }
  }
  getGoals(user.uid).then((result) => { goals = result; renderOverview(); renderList(); }).catch((error) => {
    document.querySelector("#goalsList").innerHTML = `<div class="panel empty-transactions">${escapeHtml(firebaseErrorMessage(error))}</div>`;
  });
}
