import { test, expect } from '../../src/fixtures';

// API checks use the `request` fixture: no browser, so they're fast.
test('homepage responds', { tag: '@smoke' }, async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok(), `GET / returned ${response.status()}`).toBeTruthy();
});
