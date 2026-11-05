import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { auth } from '@googleapis/gmail';

/** Read-only: the importer can search and read mail, never send, change or delete it. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** Cached sign-in for this machine. Lives in data/ (gitignored), readable only by you. */
export const TOKEN_FILE = path.join(__dirname, '..', '..', 'data', '.gmail-token.json');

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

type OAuth2Client = InstanceType<typeof auth.OAuth2>;
type Tokens = Parameters<OAuth2Client['setCredentials']>[0];

/**
 * An authorized Gmail client for the person running the script, using THEIR OAuth
 * client from .env. Reuses the cached sign-in when it's still valid; otherwise opens
 * the browser for Google's consent screen.
 */
export async function getGmailAuth(): Promise<OAuth2Client> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (see docs/SETUP.md, "Gmail access").',
    );
  }

  if (fs.existsSync(TOKEN_FILE)) {
    const client = new auth.OAuth2(clientId, clientSecret);
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as Tokens);
    saveRefreshedTokens(client);
    try {
      await client.getAccessToken(); // refreshes if expired; throws if the sign-in was revoked
      return client;
    } catch {
      console.warn(
        'Saved Gmail sign-in is no longer valid (Google expires Testing-mode sign-ins after ~7 days). Signing in again…',
      );
      fs.rmSync(TOKEN_FILE, { force: true });
    }
  }
  return signInWithBrowser(clientId, clientSecret);
}

async function signInWithBrowser(clientId: string, clientSecret: string): Promise<OAuth2Client> {
  // Google allows any loopback port for Desktop-app clients, so let the OS pick one.
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const client = new auth.OAuth2(clientId, clientSecret, redirectUri);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(16).toString('hex');
  const url = client.generateAuthUrl({
    access_type: 'offline', // get a refresh token, so later runs don't need the browser
    prompt: 'consent',
    scope: [GMAIL_SCOPE],
    state,
    code_challenge: codeChallenge,
    // PKCE. The enum type isn't re-exported by @googleapis/gmail; the value is the string 'S256'.
    code_challenge_method: 'S256' as Parameters<OAuth2Client['generateAuthUrl']>[0] extends infer O
      ? O extends { code_challenge_method?: infer M }
        ? M
        : never
      : never,
  });

  console.log('\nOpening Google sign-in in your browser. If it does not open, visit:\n' + url + '\n');
  openInBrowser(url);

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for Google sign-in (5 minutes).')),
      SIGN_IN_TIMEOUT_MS,
    );
    server.on('request', (req, res) => {
      const params = new URL(req.url ?? '/', redirectUri).searchParams;
      if (!params.has('code') && !params.has('error')) {
        res.writeHead(404).end(); // e.g. /favicon.ico
        return;
      }
      clearTimeout(timer);
      const error = params.get('error');
      if (error || params.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Sign-in failed. Check the terminal.');
        reject(new Error(error ? `Google sign-in error: ${error}` : 'Sign-in response did not match (state mismatch).'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Signed in to Job AI. You can close this tab.');
      resolve(params.get('code')!);
    });
  }).finally(() => server.close());

  const { tokens } = await client.getToken({ code, codeVerifier });
  client.setCredentials(tokens);
  writeTokens(tokens);
  saveRefreshedTokens(client);
  return client;
}

/** Google only sends the refresh token once, so merge refreshed tokens into what's saved. */
function saveRefreshedTokens(client: OAuth2Client): void {
  client.on('tokens', (fresh) => {
    const saved = fs.existsSync(TOKEN_FILE) ? (JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as Tokens) : {};
    writeTokens({ ...saved, ...fresh });
  });
}

function writeTokens(tokens: Tokens): void {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  execFile(cmd, args, () => {
    /* if it fails, the URL printed above still works */
  });
}
