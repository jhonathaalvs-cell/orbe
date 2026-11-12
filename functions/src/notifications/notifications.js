const { db, FieldValue } = require('../lib/admin');

async function createNotificationIfMissing(userId, id, notification) {
  const reference = db.doc(`users/${userId}/notifications/${id}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (!existing.exists) {
      transaction.create(reference, { ...notification, read: false, createdAt: FieldValue.serverTimestamp() });
    }
  });
}

module.exports = { createNotificationIfMissing };
