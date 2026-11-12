import { collection, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";
import { dateKeyInZone } from "../../utils/date.js";

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
  const today = dateKeyInZone(timeZone);
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
  const today = dateKeyInZone(timeZone);
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
    const paymentDate = paidDate || dateKeyInZone(timeZone);
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
