// Ponto único de importação dos serviços. As páginas importam daqui;
// cada domínio vive no seu próprio arquivo.
export { auth, db, firebaseReady } from "./client.js";
export { firebaseErrorMessage } from "./errors.js";
export * from "../auth/auth.js";
export * from "../database/transactions.js";
export * from "../database/accounts.js";
export * from "../database/goals.js";
export * from "../database/cards.js";
export * from "../database/commitments.js";
export * from "../database/notifications.js";
export * from "../database/profile.js";
