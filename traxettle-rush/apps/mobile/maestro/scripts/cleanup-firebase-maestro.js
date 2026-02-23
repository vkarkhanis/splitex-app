#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../../');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));

let admin;
function tryRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

admin =
  tryRequire('firebase-admin') ||
  tryRequire(path.join(repoRoot, 'node_modules/firebase-admin')) ||
  tryRequire(path.join(repoRoot, 'apps/api/node_modules/firebase-admin'));

if (!admin) {
  console.log('[maestro-cleanup] Skipping: firebase-admin module not found.');
  process.exit(0);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

const useFirebaseEmulator = process.env.FIREBASE_USE_EMULATOR === 'true';

function hasCreds() {
  return Boolean(projectId && clientEmail && privateKey && privateKey.trim());
}

function initFirebase() {
  if (!hasCreds() && !useFirebaseEmulator) {
    console.log('[maestro-cleanup] Skipping: Firebase credentials not configured.');
    return null;
  }

  if (useFirebaseEmulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.STORAGE_EMULATOR_HOST = process.env.STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
  }

  if (!admin.apps.length) {
    if (useFirebaseEmulator) {
      admin.initializeApp({
        projectId: projectId || 'traxettle-local',
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    }
  }
  return admin.firestore();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getDocsByPrefix(db, collection, field, prefix) {
  const snap = await db
    .collection(collection)
    .where(field, '>=', prefix)
    .where(field, '<=', `${prefix}\uf8ff`)
    .get();
  return snap.docs;
}

async function deleteDocs(db, docs) {
  if (!docs.length) return;
  for (const group of chunk(docs, 400)) {
    const batch = db.batch();
    group.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteCollectionWhereIn(db, collection, field, ids) {
  if (!ids.length) return 0;
  let total = 0;
  for (const group of chunk(ids, 10)) {
    const snap = await db.collection(collection).where(field, 'in', group).get();
    total += snap.size;
    await deleteDocs(db, snap.docs);
  }
  return total;
}

async function deleteEventWithParticipants(db, eventId) {
  const participants = await db.collection('events').doc(eventId).collection('participants').get();
  await deleteDocs(db, participants.docs);
  await db.collection('events').doc(eventId).delete();
}

async function cleanup() {
  const db = initFirebase();
  if (!db) return;

  const eventNamePrefixes = ['Maestro ', 'API EVT '];
  const userEmailPrefixes = ['maestro.', 'sadm', 'smb', 'fxa', 'fxm', 'apitest.'];
  const userNamePrefixes = ['Maestro ', 'Settle ', 'FX ', 'API Test '];

  const eventDocsById = new Map();
  for (const prefix of eventNamePrefixes) {
    const docs = await getDocsByPrefix(db, 'events', 'name', prefix);
    docs.forEach((d) => eventDocsById.set(d.id, d));
  }
  const eventIds = [...eventDocsById.keys()];

  let deletedExpenses = await deleteCollectionWhereIn(db, 'expenses', 'eventId', eventIds);
  let deletedSettlements = await deleteCollectionWhereIn(db, 'settlements', 'eventId', eventIds);
  let deletedGroups = await deleteCollectionWhereIn(db, 'groups', 'eventId', eventIds);
  let deletedInvitations = await deleteCollectionWhereIn(db, 'invitations', 'eventId', eventIds);

  for (const eventId of eventIds) {
    await deleteEventWithParticipants(db, eventId);
  }

  const extraInvitationDocs = [];
  for (const prefix of userEmailPrefixes) {
    const docs = await getDocsByPrefix(db, 'invitations', 'inviteeEmail', prefix);
    extraInvitationDocs.push(...docs);
  }
  if (extraInvitationDocs.length) {
    const dedup = new Map(extraInvitationDocs.map((d) => [d.id, d]));
    await deleteDocs(db, [...dedup.values()]);
    deletedInvitations += dedup.size;
  }

  const userDocsById = new Map();
  for (const prefix of userEmailPrefixes) {
    const docs = await getDocsByPrefix(db, 'users', 'email', prefix);
    docs.forEach((d) => userDocsById.set(d.id, d));
  }
  for (const prefix of userNamePrefixes) {
    const docs = await getDocsByPrefix(db, 'users', 'displayName', prefix);
    docs.forEach((d) => userDocsById.set(d.id, d));
  }

  const userIds = [...userDocsById.keys()];
  const userDocs = [...userDocsById.values()];
  await deleteDocs(db, userDocs);

  let deletedAuthUsers = 0;
  for (const uid of userIds) {
    try {
      await admin.auth().deleteUser(uid);
      deletedAuthUsers += 1;
    } catch {
      // ignore missing auth user entries
    }
  }

  const summary = {
    deletedEvents: eventIds.length,
    deletedExpenses,
    deletedSettlements,
    deletedGroups,
    deletedInvitations,
    deletedUserDocs: userDocs.length,
    deletedAuthUsers,
  };
  fs.writeFileSync(
    path.join(repoRoot, 'apps/mobile/maestro/artifacts/cleanup-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  console.log('[maestro-cleanup] complete', summary);
}

cleanup().catch((err) => {
  console.error('[maestro-cleanup] failed:', err?.message || err);
  process.exit(1);
});
