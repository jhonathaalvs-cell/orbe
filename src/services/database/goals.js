import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

export async function getGoals(userId) {
  const snapshot = await getDocs(query(collection(db, "users", userId, "goals"), orderBy("createdAt", "desc")));
  const goals = await Promise.all(snapshot.docs.map(async (goalDoc) => {
    const deposits = await getDocs(query(collection(db, "users", userId, "goals", goalDoc.id, "deposits"), orderBy("date", "asc")));
    return { id: goalDoc.id, ...goalDoc.data(), deposits: deposits.docs.map((item) => ({ id: item.id, ...item.data() })) };
  }));
  return goals;
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
