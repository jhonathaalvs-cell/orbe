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
