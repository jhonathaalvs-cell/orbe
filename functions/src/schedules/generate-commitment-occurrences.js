const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { db } = require('../lib/admin');
const { addDays, localDateKey, localHour } = require('../lib/dates');
const { isScheduledFor, createOccurrenceIfMissing } = require('../financial/commitment-schedule');
const { createNotificationIfMissing } = require('../notifications/notifications');

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

    // Keep a full month of checklist occurrences available in the client.
    for (let offset = 0; offset <= 40; offset += 1) {
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
