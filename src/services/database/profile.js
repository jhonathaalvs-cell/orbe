import { updateProfile } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

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
