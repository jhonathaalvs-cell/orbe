import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getFirestore,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const isConfigured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const firebaseReady = Boolean(auth && db);

function financialDateKey(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function observeAuth(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function registerAccount({ name, email, password }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await setDoc(doc(db, "users", credential.user.uid), {
    name,
    email: credential.user.email,
    createdAt: serverTimestamp(),
  });
  return credential.user;
}

export async function logIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logOut() {
  if (auth) await signOut(auth);
}

export async function saveTransaction(userId, transaction) {
  return addDoc(collection(db, "users", userId, "transactions"), {
    ...transaction,
    createdAt: serverTimestamp(),
  });
}

export async function getAccounts(userId) {
  const snapshot = await getDocs(query(collection(db, "users", userId, "accounts"), orderBy("createdAt", "asc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createAccount(userId, account) {
  return addDoc(collection(db, "users", userId, "accounts"), {
    ...account,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateAccount(userId, accountId, changes) {
  return updateDoc(doc(db, "users", userId, "accounts", accountId), changes);
}

export async function getTransfers(userId) {
  const snapshot = await getDocs(query(collection(db, "users", userId, "transfers"), orderBy("date", "desc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getGoals(userId) {
  const snapshot = await getDocs(query(collection(db, "users", userId, "goals"), orderBy("createdAt", "desc")));
  const goals = await Promise.all(snapshot.docs.map(async (goalDoc) => {
    const deposits = await getDocs(query(collection(db, "users", userId, "goals", goalDoc.id, "deposits"), orderBy("date", "asc")));
    return { id: goalDoc.id, ...goalDoc.data(), deposits: deposits.docs.map((item) => ({ id: item.id, ...item.data() })) };
  }));
  return goals;
}

export async function getCreditCards(userId) {
  const snapshot = await getDocs(query(collection(db, "users", userId, "creditCards"), orderBy("createdAt", "desc")));
  return Promise.all(snapshot.docs.map(async (cardDoc) => {
    const cardPath = doc(db, "users", userId, "creditCards", cardDoc.id);
    const [purchases, invoices] = await Promise.all([
      getDocs(query(collection(cardPath, "purchases"), orderBy("date", "desc"))),
      getDocs(query(collection(cardPath, "invoices"), orderBy("invoiceMonth", "desc"))),
    ]);
    return {
      id: cardDoc.id,
      ...cardDoc.data(),
      purchases: purchases.docs.map((item) => ({ id: item.id, ...item.data() })),
      invoices: invoices.docs.map((item) => ({ id: item.id, ...item.data() })),
    };
  }));
}

export async function createCreditCard(userId, card) {
  return addDoc(collection(db, "users", userId, "creditCards"), {
    ...card,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCreditCard(userId, cardId, changes) {
  return updateDoc(doc(db, "users", userId, "creditCards", cardId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function addCreditCardPurchase(userId, card, purchase) {
  const cardRef = doc(db, "users", userId, "creditCards", card.id);
  const purchases = Array.isArray(purchase.installments) && purchase.installments.length ? purchase.installments : [purchase];
  if (purchases.length > 10) throw new Error("O parcelamento pode ter no maximo 48 parcelas.");
  const entries = purchases.map((item) => ({
    ...item,
    ref: doc(collection(db, "users", userId, "creditCards", card.id, "purchases")),
    invoiceRef: doc(db, "users", userId, "creditCards", card.id, "invoices", item.invoiceMonth),
  }));
  if (new Set(entries.map((item) => item.invoiceRef.id)).size !== entries.length) throw new Error("As parcelas precisam cair em faturas mensais diferentes.");
  return runTransaction(db, async (transaction) => {
    const [currentCard, ...invoices] = await Promise.all([transaction.get(cardRef), ...entries.map((item) => transaction.get(item.invoiceRef))]);
    if (!currentCard.exists() || currentCard.data().active !== true) throw new Error("Este cartao esta arquivado.");
    entries.forEach((item, index) => {
      if (invoices[index].exists() && invoices[index].data().status === "paid") throw new Error("Uma das faturas das parcelas ja foi paga. Confira o fechamento do cartao.");
    });
    entries.forEach((item, index) => {
      const currentInvoice = invoices[index];
      const previous = currentInvoice.exists() ? currentInvoice.data() : null;
      const amount = Number(item.amount);
      const invoice = {
        cardId: card.id,
        invoiceMonth: item.invoiceMonth,
        dueDate: item.dueDate,
        total: Number(previous?.total || 0) + amount,
        purchaseCount: Number(previous?.purchaseCount || 0) + 1,
        status: "open",
        lastPurchaseId: item.ref.id,
        lastPurchaseAmount: amount,
        updatedAt: serverTimestamp(),
        ...(!previous ? { createdAt: serverTimestamp() } : {}),
      };
      const { ref, invoiceRef, ...purchaseData } = item;
      transaction.set(invoiceRef, invoice);
      transaction.set(ref, { ...purchaseData, cardId: card.id, createdAt: serverTimestamp() });
    });
    return entries.map((item) => item.ref);
  });
}
export async function payCreditCardInvoice(userId, card, invoice, accountId, paidDate) {
  const cardRef = doc(db, "users", userId, "creditCards", card.id);
  const invoiceRef = doc(db, "users", userId, "creditCards", card.id, "invoices", invoice.id);
  const accountRef = accountId ? doc(db, "users", userId, "accounts", accountId) : null;
  const transactionRef = doc(collection(db, "users", userId, "transactions"));
  return runTransaction(db, async (transaction) => {
    const reads = [transaction.get(cardRef), transaction.get(invoiceRef)];
    if (accountRef) reads.push(transaction.get(accountRef));
    const [currentCard, currentInvoice, accountSnapshot] = await Promise.all(reads);
    if (!currentCard.exists() || !currentInvoice.exists() || currentInvoice.data().status !== "open") throw new Error("Esta fatura já foi paga ou não está disponível.");
    if (accountRef && (!accountSnapshot.exists() || accountSnapshot.data().active !== true)) throw new Error("Escolha uma conta ativa para pagar a fatura.");
    if (accountRef && paidDate < accountSnapshot.data().openingDate) throw new Error("A data do pagamento é anterior ao início desta conta.");
    const total = Number(currentInvoice.data().total);
    transaction.update(invoiceRef, {
      status: "paid",
      paidAt: serverTimestamp(),
      paidDate,
      paidAmount: total,
      transactionId: transactionRef.id,
      updatedAt: serverTimestamp(),
    });
    transaction.set(transactionRef, {
      type: "expense",
      description: `Fatura ${currentCard.data().name} (${invoice.id})`.slice(0, 50),
      amount: total,
      category: "Cartão de crédito",
      date: paidDate,
      sourceCardId: card.id,
      sourceInvoiceMonth: invoice.id,
      ...(accountId ? { accountId } : {}),
      createdAt: serverTimestamp(),
    });
  });
}

export async function createGoal(userId, goal) {
  return addDoc(collection(db, "users", userId, "goals"), {
    ...goal,
    monthlyContribution: goal.monthlyContribution || null,
    targetHistory: [{ amount: goal.targetAmount, date: goal.createdDate }],
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateGoal(userId, goalId, changes) {
  const ref = doc(db, "users", userId, "goals", goalId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Esta meta não existe mais.");
  const previous = snapshot.data();
  const targetHistory = changes.targetAmount && changes.targetAmount !== previous.targetAmount
    ? [...(previous.targetHistory || []), { amount: changes.targetAmount, date: changes.updatedDate }]
    : previous.targetHistory || [];
  return updateDoc(ref, { ...changes, targetHistory, updatedAt: serverTimestamp() });
}

export async function recordGoalDeposit(userId, goalId, deposit, targetAmount) {
  const goalRef = doc(db, "users", userId, "goals", goalId);
  const depositRef = doc(collection(db, "users", userId, "goals", goalId, "deposits"));
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(goalRef);
    if (!snapshot.exists()) throw new Error("Esta meta não existe mais.");
    const goal = snapshot.data();
    const changes = { updatedAt: serverTimestamp() };
    if (targetAmount && targetAmount !== goal.targetAmount) {
      changes.targetAmount = targetAmount;
      changes.updatedDate = deposit.date;
      changes.targetHistory = [...(goal.targetHistory || []), { amount: targetAmount, date: deposit.date }];
    }
    transaction.update(goalRef, changes);
    transaction.set(depositRef, { ...deposit, createdAt: serverTimestamp() });
    return depositRef;
  });
}

export async function deleteGoal(userId, goalId) {
  const depositsRef = collection(db, "users", userId, "goals", goalId, "deposits");
  while (true) {
    const snapshot = await getDocs(query(depositsRef, limit(450)));
    if (snapshot.empty) break;
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return deleteDoc(doc(db, "users", userId, "goals", goalId));
}

export async function createTransfer(userId, transfer) {
  return addDoc(collection(db, "users", userId, "transfers"), {
    ...transfer,
    createdAt: serverTimestamp(),
  });
}

export async function getTransactions(userId) {
  const transactionsQuery = query(
    collection(db, "users", userId, "transactions"),
    orderBy("date", "desc"),
  );
  const snapshot = await getDocs(transactionsQuery);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getCommitments(userId) {
  const snapshot = await getDocs(collection(db, "users", userId, "commitments"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createCommitment(userId, commitment) {
  const commitmentRef = doc(collection(db, "users", userId, "commitments"));
  const occurrenceRef = doc(db, "users", userId, "commitments", commitmentRef.id, "occurrences", commitment.startDate);
  const batch = writeBatch(db);
  batch.set(commitmentRef, {
    ...commitment,
    active: true,
    createdAt: serverTimestamp(),
  });
  batch.set(occurrenceRef, {
    commitmentId: commitmentRef.id,
    name: commitment.name,
    category: commitment.category,
    amount: commitment.amount,
    dueDate: commitment.startDate,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return commitmentRef;
}

export async function getCommitmentOccurrences(userId, commitments) {
  const snapshots = await Promise.all(commitments.map((commitment) =>
    getDocs(query(collection(db, "users", userId, "commitments", commitment.id, "occurrences"), orderBy("dueDate", "asc"))),
  ));
  return snapshots.flatMap((snapshot, index) => snapshot.docs.map((item) => ({
    id: item.id,
    commitmentId: commitments[index].id,
    ...item.data(),
    commitmentName: item.data().name || commitments[index].name,
    commitmentCategory: item.data().category || commitments[index].category,
  }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function updateCommitment(userId, commitmentId, changes, timeZone) {
  const commitmentRef = doc(db, "users", userId, "commitments", commitmentId);
  const occurrences = await getDocs(collection(db, "users", userId, "commitments", commitmentId, "occurrences"));
  const today = financialDateKey(timeZone);
  const batch = writeBatch(db);
  batch.update(commitmentRef, changes);
  occurrences.docs.forEach((item) => {
    const occurrence = item.data();
    if (occurrence.status === "pending" && occurrence.dueDate >= today) {
      batch.update(item.ref, { name: changes.name, category: changes.category, amount: changes.amount });
    }
  });
  await batch.commit();
}

export async function setCommitmentActive(userId, commitmentId, active, timeZone) {
  const commitmentRef = doc(db, "users", userId, "commitments", commitmentId);
  const occurrences = active ? null : await getDocs(collection(db, "users", userId, "commitments", commitmentId, "occurrences"));
  const today = financialDateKey(timeZone);
  const batch = writeBatch(db);
  batch.update(commitmentRef, { active });
  occurrences?.docs.forEach((item) => {
    const occurrence = item.data();
    if (occurrence.status === "pending" && occurrence.dueDate >= today) {
      batch.update(item.ref, { status: "skipped", skippedAt: serverTimestamp() });
    }
  });
  await batch.commit();
}

export async function skipCommitmentOccurrence(userId, occurrence) {
  const occurrenceRef = doc(db, "users", userId, "commitments", occurrence.commitmentId, "occurrences", occurrence.id);
  const commitmentRef = doc(db, "users", userId, "commitments", occurrence.commitmentId);
  await runTransaction(db, async (transaction) => {
    const [currentOccurrence, currentCommitment] = await Promise.all([transaction.get(occurrenceRef), transaction.get(commitmentRef)]);
    if (!currentOccurrence.exists() || currentOccurrence.data().status !== "pending") throw new Error("Este vencimento ja foi resolvido.");
    transaction.update(occurrenceRef, { status: "skipped", skippedAt: serverTimestamp() });
    if (currentCommitment.exists() && currentCommitment.data().frequency === "once") transaction.update(commitmentRef, { active: false });
  });
}

export async function confirmCommitmentPayment(userId, occurrence, paidAmount, timeZone, accountId = "", paidDate = "") {
  const occurrenceRef = doc(db, "users", userId, "commitments", occurrence.commitmentId, "occurrences", occurrence.id);
  const transactionRef = doc(collection(db, "users", userId, "transactions"));
  await runTransaction(db, async (transaction) => {
    const commitmentRef = doc(db, "users", userId, "commitments", occurrence.commitmentId);
    const [current, commitmentSnapshot] = await Promise.all([transaction.get(occurrenceRef), transaction.get(commitmentRef)]);
    if (!current.exists() || current.data().status !== "pending") {
      throw new Error("Esta conta já foi confirmada ou não está mais pendente.");
    }
    const item = current.data();
    const paymentDate = paidDate || financialDateKey(timeZone);
    transaction.update(occurrenceRef, {
      status: "paid",
      paidAt: serverTimestamp(),
      paidDate: paymentDate,
      transactionId: transactionRef.id,
      paidAmount,
    });
    if (commitmentSnapshot.exists() && commitmentSnapshot.data().frequency === "once") transaction.update(commitmentRef, { active: false });
    transaction.set(transactionRef, {
      type: "expense",
      description: item.name,
      amount: paidAmount,
      category: item.category,
      date: paymentDate,
      sourceCommitmentId: occurrence.commitmentId,
      sourceOccurrenceId: occurrence.id,
      ...(accountId ? { accountId } : {}),
      createdAt: serverTimestamp(),
    });
  });
}

export async function getNotifications(userId) {
  const snapshot = await getDocs(query(
    collection(db, "users", userId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(10),
  ));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function markNotificationRead(userId, notificationId) {
  return updateDoc(doc(db, "users", userId, "notifications", notificationId), { read: true });
}

export async function getUserProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  const stored = snapshot.exists() ? snapshot.data() : {};
  return {
    name: stored.name || user.displayName || user.email?.split("@")[0] || "Minha conta",
    email: user.email || "",
    createdAt: stored.createdAt || null,
    currency: stored.currency || "BRL",
    timeZone: stored.timeZone || "America/Sao_Paulo",
    notificationPreferences: {
      commitmentDue: stored.notificationPreferences?.commitmentDue !== false,
      commitmentOverdue: stored.notificationPreferences?.commitmentOverdue !== false,
    },
  };
}

export async function saveUserProfile(user, profile) {
  const profileRef = doc(db, "users", user.uid);
  await updateDoc(profileRef, {
    name: profile.name,
    currency: profile.currency,
    timeZone: profile.timeZone,
    notificationPreferences: profile.notificationPreferences,
  });
  if (user.displayName !== profile.name) {
    await updateProfile(user, { displayName: profile.name });
  }
}

export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export function firebaseErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já possui cadastro. Entre na sua conta.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "permission-denied": "O Firestore recusou a operação. Publique as regras de segurança incluídas no projeto.",
    "unavailable": "Firebase indisponível no momento. Verifique sua conexão e tente novamente.",
  };
  return messages[error?.code] || "Não foi possível concluir. Confira as configurações do Firebase e tente novamente.";
}
