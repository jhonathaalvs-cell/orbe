import { addDoc, collection, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { db } from "../firebase/client.js";

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
  if (purchases.length > 10) throw new Error("O parcelamento pode ter no maximo 10 parcelas.");
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
        createdAt: previous ? previous.createdAt : serverTimestamp(),
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
