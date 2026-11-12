const { db, FieldValue } = require('../lib/admin');
const { addDays, parseDate } = require('../lib/dates');

function isScheduledFor(commitment, dateKey) {
  const start = commitment.startDate;
  if (!start || dateKey < start || (commitment.endDate && dateKey > commitment.endDate)) return false;
  if (commitment.frequency === 'once') return dateKey === start;

  const date = parseDate(dateKey);
  const first = parseDate(start);
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const startDay = first.getUTCDate();

  if (commitment.frequency === 'daily') return true;
  if (commitment.frequency === 'weekly') {
    return Math.floor((date - first) / 86400000) % 7 === 0;
  }
  if (commitment.frequency === 'monthly') return day === Math.min(startDay, lastDay);
  if (commitment.frequency === 'yearly') {
    const startLastDay = new Date(Date.UTC(date.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return month === first.getUTCMonth() && day === Math.min(startDay, startLastDay);
  }
  return false;
}

async function createOccurrenceIfMissing(userId, commitmentId, commitment, dateKey, today, remindersEnabled) {
  const occurrenceId = dateKey;
  const path = `users/${userId}/commitments/${commitmentId}/occurrences/${occurrenceId}`;
  const occurrenceRef = db.doc(path);
  const dueNotificationRef = db.doc(`users/${userId}/notifications/commitment_${commitmentId}_${occurrenceId}_due`);
  const notificationIsDue = remindersEnabled && dateKey <= addDays(today, 1);

  await db.runTransaction(async (transaction) => {
    const [occurrenceSnapshot, notificationSnapshot] = await Promise.all([
      transaction.get(occurrenceRef),
      notificationIsDue ? transaction.get(dueNotificationRef) : Promise.resolve(null),
    ]);

    if (!occurrenceSnapshot.exists) {
      transaction.create(occurrenceRef, {
        commitmentId,
        name: commitment.name,
        category: commitment.category,
        amount: commitment.amount,
        dueDate: dateKey,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const isStillPending = !occurrenceSnapshot.exists || occurrenceSnapshot.data().status === 'pending';
    if (notificationIsDue && isStillPending && !notificationSnapshot.exists) {
      transaction.create(dueNotificationRef, {
        type: 'commitment_due',
        title: dateKey === today ? 'Compromisso vence hoje' : 'Compromisso próximo do vencimento',
        body: `${commitment.name} — R$ ${Number(commitment.amount).toFixed(2)}. Confirme somente após realizar o pagamento.`,
        commitmentId,
        occurrenceId,
        dueDate: dateKey,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

module.exports = { isScheduledFor, createOccurrenceIfMissing };
