const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();
const db = getFirestore();
function localDateKey(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localHour(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
}

function addDays(dateKey, count) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function parseDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

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

async function createNotificationIfMissing(userId, id, notification) {
  const reference = db.doc(`users/${userId}/notifications/${id}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (!existing.exists) {
      transaction.create(reference, { ...notification, read: false, createdAt: FieldValue.serverTimestamp() });
    }
  });
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

exports.generateCommitmentOccurrences = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'UTC',
  region: 'southamerica-east1',
  maxInstances: 1,
}, async () => {
  const now = new Date();
  const commitments = await db.collectionGroup('commitments').get();
  const preferencesByUser = new Map();
  let generated = 0;
  let notified = 0;

  for (const snapshot of commitments.docs) {
    const commitment = snapshot.data();
    const userId = snapshot.ref.parent.parent?.id;
    if (!userId || commitment.active !== true || !commitment.startDate) continue;
    if (!preferencesByUser.has(userId)) {
      const userSnapshot = await db.doc(`users/${userId}`).get();
      const profile = userSnapshot.data() || {};
      preferencesByUser.set(userId, {
        ...(profile.notificationPreferences || {}),
        timeZone: profile.timeZone || 'America/Sao_Paulo',
      });
    }
    const preferences = preferencesByUser.get(userId);
    if (localHour(now, preferences.timeZone) !== 8) continue;
    const today = localDateKey(now, preferences.timeZone);
    const commitmentId = snapshot.id;
    const occurrences = snapshot.ref.collection('occurrences');

    for (let offset = 0; offset <= 7; offset += 1) {
      const dueDate = addDays(today, offset);
      if (!isScheduledFor(commitment, dueDate)) continue;
      await createOccurrenceIfMissing(userId, commitmentId, commitment, dueDate, today, preferences.commitmentDue !== false);
      generated += 1;
    }

    const existingOccurrences = await occurrences.get();
    for (const occurrence of existingOccurrences.docs) {
      const item = occurrence.data();
      if (item.status !== 'pending' || !item.dueDate || item.dueDate >= today || preferences.commitmentOverdue === false) continue;
      const notificationId = `commitment_${commitmentId}_${occurrence.id}_overdue`;
      await createNotificationIfMissing(userId, notificationId, {
        type: 'commitment_overdue',
        title: 'Confirmação de pagamento pendente',
        body: `${item.name} venceu em ${item.dueDate}. O sistema não marcou como pago; confirme ou revise o compromisso.`,
        commitmentId,
        occurrenceId: occurrence.id,
        dueDate: item.dueDate,
      });
      notified += 1;
    }
  }

  logger.info('Commitment schedule completed', { scanned: commitments.size, generated, notified });
});
