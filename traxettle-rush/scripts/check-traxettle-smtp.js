#!/usr/bin/env node

const path = require('path');

function loadNodemailer() {
  const candidatePaths = [
    '/Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/api',
    process.cwd(),
  ];

  for (const basePath of candidatePaths) {
    try {
      const resolved = require.resolve('nodemailer', { paths: [basePath] });
      return require(resolved);
    } catch {
      // Try the next path.
    }
  }

  throw new Error(
    'Could not resolve nodemailer. Expected it to be available from the Traxettle API workspace.',
  );
}

const nodemailer = loadNodemailer();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function readEnv(name, fallback = '') {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : fallback;
}

function maskEmail(value) {
  if (!value) return '(empty)';
  const [local, domain = ''] = value.split('@');
  const localMasked =
    local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***`;
  return `${localMasked}@${domain}`;
}

function maskSecret(value) {
  if (!value) return '(empty)';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function createTransport(config) {
  const service = (config.service || '').toLowerCase();
  if (service === 'gmail' || service === 'google') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function logConfig(config) {
  console.log('SMTP check configuration');
  console.log(`- mode: ${config.service ? `service=${config.service}` : `host=${config.host}:${config.port}`}`);
  console.log(`- secure: ${String(config.secure)}`);
  console.log(`- user: ${maskEmail(config.user)}`);
  console.log(`- password: ${maskSecret(config.pass)} (length=${config.pass.length})`);
  console.log(`- from: ${config.from || '(not set)'}`);
  console.log(`- reply-to: ${config.replyTo || '(not set)'}`);
}

function explainError(err) {
  const message = err && err.message ? String(err.message) : String(err);
  const code = err && err.code ? String(err.code) : '';
  const response = err && err.response ? String(err.response) : '';
  const combined = `${code} ${message} ${response}`.toLowerCase();

  if (
    combined.includes('invalid login') ||
    combined.includes('badcredentials') ||
    combined.includes('username and password not accepted') ||
    combined.includes('535')
  ) {
    return 'Authentication failed. The Gmail address or app password is wrong, missing, revoked, or the account is not allowed to use SMTP with the supplied credentials.';
  }

  if (combined.includes('timeout') || combined.includes('etimedout')) {
    return 'Connection timed out. This usually means a network/firewall problem or the SMTP host/port is unreachable.';
  }

  if (combined.includes('econnrefused')) {
    return 'Connection was refused. Check SMTP host and port.';
  }

  if (combined.includes('self signed certificate') || combined.includes('tls')) {
    return 'TLS negotiation failed. Check the secure/port combination.';
  }

  return 'SMTP check failed. Review the raw error details below.';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = {
    service: args.service || readEnv('SMTP_SERVICE', readEnv('SMTP_PROVIDER')),
    host: args.host || readEnv('SMTP_HOST', 'smtp.gmail.com'),
    port: Number.parseInt(args.port || readEnv('SMTP_PORT', '587'), 10),
    secure: (args.secure || readEnv('SMTP_SECURE', 'false')) === 'true',
    user: args.user || readEnv('SMTP_USER'),
    pass: args.pass || readEnv('SMTP_PASS', readEnv('SMTP_PASSWORD')),
    from: args.from || readEnv('SMTP_FROM'),
    replyTo: args.replyTo || readEnv('SMTP_REPLY_TO'),
    sendTo: args.sendTo || args.sendto || '',
  };

  logConfig(config);

  if (!config.user || !config.pass) {
    console.error('\nMissing credentials. Set SMTP_USER and SMTP_PASS (or SMTP_PASSWORD).');
    process.exit(1);
  }

  const transporter = createTransport(config);

  try {
    await transporter.verify();
    console.log('\nSMTP verify: SUCCESS');
  } catch (err) {
    console.error('\nSMTP verify: FAILED');
    console.error(`Reason: ${explainError(err)}`);
    console.error('Raw error:', {
      code: err && err.code ? err.code : undefined,
      command: err && err.command ? err.command : undefined,
      response: err && err.response ? err.response : undefined,
      message: err && err.message ? err.message : String(err),
    });
    process.exit(2);
  }

  if (!config.sendTo) {
    console.log('\nNo --sendTo provided, so this run only verified SMTP auth/connectivity.');
    return;
  }

  const subject = `Traxettle SMTP check ${new Date().toISOString()}`;
  const text = [
    'This is a temporary SMTP verification email.',
    '',
    `Sent at: ${new Date().toISOString()}`,
    `SMTP user: ${config.user}`,
    `Mode: ${config.service ? `service=${config.service}` : `${config.host}:${config.port}`}`,
  ].join('\n');

  try {
    const info = await transporter.sendMail({
      from: config.from || config.user,
      replyTo: config.replyTo || undefined,
      to: config.sendTo,
      subject,
      text,
      html: `<p>This is a temporary SMTP verification email.</p><p><strong>Sent at:</strong> ${new Date().toISOString()}</p>`,
    });

    console.log('\nTest email: SUCCESS');
    console.log(`- messageId: ${info.messageId || '(none)'}`);
    console.log(`- accepted: ${(info.accepted || []).join(', ') || '(none)'}`);
    console.log(`- rejected: ${(info.rejected || []).join(', ') || '(none)'}`);
  } catch (err) {
    console.error('\nTest email: FAILED');
    console.error(`Reason: ${explainError(err)}`);
    console.error('Raw error:', {
      code: err && err.code ? err.code : undefined,
      command: err && err.command ? err.command : undefined,
      response: err && err.response ? err.response : undefined,
      message: err && err.message ? err.message : String(err),
    });
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(99);
});
