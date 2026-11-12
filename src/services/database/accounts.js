import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

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
