// Looks up a test user's id, for test ids that end in it (for example `spender-<id>` on the Pool
// screen), where names alone can't pick the right row. Signs in to the Firebase Auth emulator, whose
// user id is the app's.
// env: EMAIL (the user, with the password sign-up.yaml sets), OUT (the output.* key to set),
// AUTH_EMULATOR (passed by run-maestro.sh; defaults to the usual emulator address).
var base = typeof AUTH_EMULATOR !== 'undefined' && AUTH_EMULATOR ? AUTH_EMULATOR : 'http://127.0.0.1:9099';
var response = http.post(base + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=maestro', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: 'Password123!', returnSecureToken: true }),
});
var body = json(response.body);
if (!body || !body.localId) {
  throw new Error('Could not look up ' + EMAIL + ' at ' + base + ': ' + response.body);
}
output[OUT] = body.localId;
