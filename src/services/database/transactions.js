import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

export async function saveTransaction(userId, transaction) {
  return addDoc(collection(db, "users", userId, "transactions"), {
    ...transaction,
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
