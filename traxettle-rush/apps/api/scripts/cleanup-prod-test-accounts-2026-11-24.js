#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-off: removes the test accounts that Maestro runs created in PRODUCTION on 2026-11-24, and
 * everything tied to them. (A Release test app reached the production API by mistake; the suite now
 * uses a Debug app and a safety check. See traxettle-app/docs/runbook/REGRESSION_SUITE.md.)
 *
 * It removes:
 *   - Firebase Authentication users;
 *   - users/{uid} with all its subcollections (sessions);
 *   - their events with all subcollections (participants), and each event's expenses,
 *     settlements, invitations, groups and pool records;
 *   - invitations sent to or by them, and groups made only of them.
 *
 * Safety:
 *   - Works from the exact 31 email addresses below (all @example.com), never a prefix or a domain.
 *   - DRY RUN unless you pass --apply: it prints what it would delete and changes nothing.
 *   - Skips (and reports) any event that has a participant who isn't one of these accounts, or
 *     whose name doesn't end with one of their run ids. Same for groups and invitations.
 *   - Refuses to run if --project doesn't match the credentials' project, or if Firebase emulator
 *     variables are set.
 *
 * Usage, from anywhere in the repo after `rush install`:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-service-account.json \
 *     node traxettle-rush/apps/api/scripts/cleanup-prod-test-accounts-2026-11-24.js --project <prod-project-id>
 *
 *   # read the plan, then run the same command with --apply
 *
 * Credentials, in this order: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PRIVATE_KEY_FILE (a
 * service-account JSON file); FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY;
 * otherwise Application Default Credentials (`gcloud auth application-default login`).
 *
 * With --apply it writes what it deleted to ~/traxettle-prod-cleanup-2026-11-24.result.json.
 * Testing it against the emulator: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST and
 * pass --project traxettle-local.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const EMAILS = [
  'maestro.auth.1795518094086@example.com',
  'maestro.auth.1795518184284@example.com',
  'maestro.auth.1795518304958@example.com',
  'maestro.auth.1795518354625@example.com',
  'maestro.auth.1795518418084@example.com',
  'maestro.auth.1795518515523@example.com',
  'maestro.auth.1795518802228@example.com',
  'maestro.auth.1795518895239@example.com',
  'maestro.auth.1795519016593@example.com',
  'maestro.auth.1795519149376@example.com',
  'nav1795519290236@example.com',
  'evtmgr1795519357182@example.com',
  'evtmgr1795519491295@example.com',
  'evtmgr1795519582693@example.com',
  'evtmgr1795519734775@example.com',
  'invited1795519734775@example.com',
  'nav1795519841480@example.com',
  'evtmgr1795519913074@example.com',
  'invited1795519913074@example.com',
  'nav1795520019005@example.com',
  'maestro.auth.1795520080723@example.com',
  'maestro.auth.1795520271811@example.com',
  'grpadm1795520403164@example.com',
  'grpmb1795520403164@example.com',
  'grpadm1795520560572@example.com',
  'grpmb1795520560572@example.com',
  'grpadm1795520777025@example.com',
  'grpmb1795520777025@example.com',
  'sadm1795521015180@example.com',
  'smb1795521015180@example.com',
  'fxadm1795521346670@example.com',
];

// Every address must be one of the test patterns: a guard against a typo widening the list.
const EMAIL_PATTERN = /^(maestro\.auth\.|nav|evtmgr|invited|grpadm|grpmb|sadm|smb|fxadm)(\d{13})@example\.com$/;
const RUN_IDS = new Set();
for (const email of EMAILS) {
  const m = email.match(EMAIL_PATTERN);
  if (!m) throw new Error(`Not a test address: ${email}`);
  RUN_IDS.add(m[2]);
}
const EMAIL_SET = new Set(EMAILS);
const MAX_EVENTS = 20; // 8 expected; more means something is off
const POOL_COLLECTIONS = ['poolContributions', 'poolCycles', 'poolAdvances'];
const EVENT_COLLECTIONS = ['expenses', 'settlements', 'invitations', ...POOL_COLLECTIONS];

// ── Arguments and connection ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectArg = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectArg || projectArg.startsWith('--')) {
  console.error('Pass the production project id: --project <id>');
  process.exit(2);
}

let admin;
try {
  admin = require('firebase-admin'); // resolves from apps/api/node_modules
} catch {
  console.error('firebase-admin not found. Run `rush install` in traxettle-rush first.');
  process.exit(2);
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (usingEmulator && projectArg !== 'traxettle-local') {
  console.error('Firebase emulator variables are set (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST).');
  console.error('Unset them to clean production. (The emulator is only for testing this script, with --project traxettle-local.)');
  process.exit(2);
}

function credential() {
  if (usingEmulator) return undefined;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_PRIVATE_KEY_FILE;
  if (keyFile) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(keyFile), 'utf8'));
    if (sa.project_id && sa.project_id !== projectArg) {
      console.error(`The key file is for project "${sa.project_id}", not "${projectArg}". Stopping.`);
      process.exit(2);
    }
    return admin.credential.cert(sa);
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    if (FIREBASE_PROJECT_ID && FIREBASE_PROJECT_ID !== projectArg) {
      console.error(`FIREBASE_PROJECT_ID is "${FIREBASE_PROJECT_ID}", not "${projectArg}". Stopping.`);
      process.exit(2);
    }
    return admin.credential.cert({
      projectId: projectArg,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }
  return admin.credential.applicationDefault();
}

admin.initializeApp({ projectId: projectArg, ...(usingEmulator ? {} : { credential: credential() }) });
const db = admin.firestore();
const auth = admin.auth();

// ── Helpers ─────────────────────────────────────────────────────────────────────────────
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function queryIn(collection, field, values, op = 'in') {
  const docs = new Map();
  for (const group of chunk(values, 10)) {
    if (!group.length) continue;
    const snap = await db.collection(collection).where(field, op, group).get();
    snap.docs.forEach((d) => docs.set(d.ref.path, d));
  }
  return [...docs.values()];
}

const endsWithRunId = (name) => {
  const m = String(name || '').match(/(\d{13})\s*$/);
  return Boolean(m && RUN_IDS.has(m[1]));
};

// ── 1. Find the accounts ────────────────────────────────────────────────────────────────
async function findAccounts() {
  const byUid = new Map(); // uid -> { email, inAuth, inUsers }
  for (const email of EMAILS) {
    try {
      const u = await auth.getUserByEmail(email);
      byUid.set(u.uid, { email, inAuth: true, inUsers: false });
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
  }
  for (const doc of await queryIn('users', 'email', EMAILS)) {
    const email = doc.get('email');
    if (!EMAIL_SET.has(email)) continue;
    const entry = byUid.get(doc.id) || { email, inAuth: false, inUsers: false };
    entry.inUsers = true;
    byUid.set(doc.id, entry);
  }
  return byUid;
}

// ── 2. Work out what to delete ──────────────────────────────────────────────────────────
async function plan(accounts) {
  const uids = [...accounts.keys()];
  const isTest = (uid) => accounts.has(uid);
  const skipped = [];

  const eventDocs = new Map();
  for (const d of await queryIn('events', 'createdBy', uids)) eventDocs.set(d.id, d);
  for (const d of await queryIn('events', 'participantIds', uids, 'array-contains-any')) eventDocs.set(d.id, d);

  const events = [];
  for (const doc of eventDocs.values()) {
    const data = doc.data() || {};
    const participants = await doc.ref.collection('participants').get();
    const people = new Set([...(data.participantIds || []), ...participants.docs.map((p) => p.id), data.createdBy].filter(Boolean));
    const outsiders = [...people].filter((uid) => !isTest(uid));
    if (outsiders.length || !endsWithRunId(data.name)) {
      skipped.push({ kind: 'event', id: doc.id, name: data.name, why: outsiders.length ? `has ${outsiders.length} other participant(s)` : "name doesn't end with a test run id" });
      continue;
    }
    events.push({ id: doc.id, name: data.name, status: data.status, ref: doc.ref });
  }
  if (events.length > MAX_EVENTS) throw new Error(`Found ${events.length} events, more than the ${MAX_EVENTS} expected. Stopping.`);
  const eventIds = new Set(events.map((e) => e.id));

  // Records that belong to those events.
  const related = new Map(); // path -> { collection, id, ref }
  const add = (collection, d) => related.set(d.ref.path, { collection, id: d.id, ref: d.ref });
  for (const collection of EVENT_COLLECTIONS) {
    for (const d of await queryIn(collection, 'eventId', [...eventIds])) add(collection, d);
  }
  const groupDocs = new Map();
  for (const d of await queryIn('groups', 'eventId', [...eventIds])) groupDocs.set(d.id, d);
  for (const d of await queryIn('groups', 'eventIds', [...eventIds], 'array-contains-any')) groupDocs.set(d.id, d);
  for (const d of await queryIn('groups', 'members', uids, 'array-contains-any')) groupDocs.set(d.id, d);
  for (const d of groupDocs.values()) {
    const g = d.data() || {};
    const groupEvents = [g.eventId, ...(g.eventIds || [])].filter(Boolean);
    const outsiders = (g.members || []).filter((uid) => !isTest(uid));
    if (outsiders.length || groupEvents.some((id) => !eventIds.has(id))) {
      skipped.push({ kind: 'group', id: d.id, name: g.name, why: outsiders.length ? 'has other members' : 'belongs to an event that is kept' });
      continue;
    }
    add('groups', d);
  }

  // Invitations to or from the accounts, outside those events too.
  const invites = [
    ...(await queryIn('invitations', 'inviteeEmail', EMAILS)),
    ...(await queryIn('invitations', 'invitedBy', uids)),
  ];
  for (const d of invites) {
    if (related.has(d.ref.path)) continue;
    const inv = d.data() || {};
    const eventKept = inv.eventId && !eventIds.has(inv.eventId) && (await db.collection('events').doc(inv.eventId).get()).exists;
    if (eventKept && !EMAIL_SET.has(inv.inviteeEmail)) {
      skipped.push({ kind: 'invitation', id: d.id, why: `invites ${inv.inviteeEmail} to an event that is kept` });
      continue;
    }
    add('invitations', d);
  }

  return { accounts, events, related: [...related.values()], skipped };
}

// ── 3. Report, and delete with --apply ──────────────────────────────────────────────────
function report(p) {
  const target = usingEmulator ? `the local EMULATOR (${projectArg})` : `PRODUCTION project "${projectArg}"`;
  console.log(`\n${apply ? 'DELETING from' : 'DRY RUN against'} ${target}\n`);
  const missing = EMAILS.filter((e) => ![...p.accounts.values()].some((a) => a.email === e));
  console.log(`Accounts found: ${p.accounts.size} of ${EMAILS.length}`);
  for (const [uid, a] of p.accounts) console.log(`  ${a.email}  uid=${uid}${a.inAuth ? '' : '  (no Auth user)'}${a.inUsers ? '' : '  (no users doc)'}`);
  if (missing.length) console.log(`  Not found (nothing to delete): ${missing.join(', ')}`);
  console.log(`\nEvents to delete, with all subcollections: ${p.events.length}`);
  for (const e of p.events) console.log(`  ${e.name}  [${e.status}]  id=${e.id}`);
  const counts = {};
  p.related.forEach((r) => { counts[r.collection] = (counts[r.collection] || 0) + 1; });
  console.log('\nOther records to delete:', Object.keys(counts).length ? counts : 'none');
  console.log(`\nKept (not test-only, look at these yourself): ${p.skipped.length ? '' : 'none'}`);
  p.skipped.forEach((s) => console.log(`  ${s.kind} ${s.id}${s.name ? ` "${s.name}"` : ''}: ${s.why}`));
}

async function execute(p) {
  const result = { at: new Date().toISOString(), project: projectArg, events: [], records: [], users: [], authUsers: [] };
  for (const group of chunk(p.related, 400)) {
    const batch = db.batch();
    group.forEach((r) => batch.delete(r.ref));
    await batch.commit();
    result.records.push(...group.map((r) => `${r.collection}/${r.id}`));
  }
  for (const e of p.events) {
    await db.recursiveDelete(e.ref); // the event and its participants (and any other subcollection)
    result.events.push(`${e.id} ${e.name}`);
  }
  for (const [uid, a] of p.accounts) {
    if (a.inUsers) {
      await db.recursiveDelete(db.collection('users').doc(uid)); // the profile and its sessions
      result.users.push(uid);
    }
  }
  const authUids = [...p.accounts].filter(([, a]) => a.inAuth).map(([uid]) => uid);
  if (authUids.length) {
    const res = await auth.deleteUsers(authUids);
    result.authUsers = authUids;
    res.errors.forEach((e) => console.error(`  Auth delete failed for ${authUids[e.index]}: ${e.error.message}`));
  }
  const out = path.join(os.homedir(), 'traxettle-prod-cleanup-2026-11-24.result.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`\nDone: ${result.events.length} events, ${result.records.length} records, ${result.users.length} user docs, ${result.authUsers.length} Auth users. Log: ${out}`);
}

(async () => {
  const p = await plan(await findAccounts());
  report(p);
  if (!apply) {
    console.log('\nNothing was changed. Run again with --apply to delete the above.');
    return;
  }
  await execute(p);
})().catch((err) => {
  console.error(`\nStopped: ${err.message || err}`);
  process.exit(1);
});
