import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

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
