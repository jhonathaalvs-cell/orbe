const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

module.exports = { db, FieldValue };
