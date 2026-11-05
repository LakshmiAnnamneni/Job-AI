import path from 'node:path';

/** Where the logged-in session is saved by tests/auth.setup.ts. */
export const AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'user.json');

export const env = {
  username: process.env.TEST_USERNAME ?? '',
  password: process.env.TEST_PASSWORD ?? '',
};

export const hasCredentials = (): boolean => Boolean(env.username && env.password);
