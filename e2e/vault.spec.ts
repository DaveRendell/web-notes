import { expect, test } from '@playwright/test';

// All external requests are intercepted. These tests never use a Google account.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('web-notes:google-access-token', JSON.stringify({
      accessToken: 'fake-browser-test-token', accountId: 'test-account',
      expiresAt: Date.now() + 3_600_000, scope: 'https://www.googleapis.com/auth/drive',
    }));
    localStorage.setItem('web-notes:selected-vault', JSON.stringify({ id: 'vault', name: 'Test vault' }));
  });
  await page.route('https://**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'accounts.google.com') {
      await route.fulfill({ contentType: 'application/javascript', body: 'window.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } };' });
      return;
    }
    if (url.hostname !== 'www.googleapis.com') {
      await route.abort();
      return;
    }
    const files = [
      { id: 'welcome', name: 'Welcome.md', mimeType: 'text/markdown', parents: ['vault'], modifiedTime: '2026-01-01T00:00:00Z' },
      { id: 'second', name: 'Second.md', mimeType: 'text/markdown', parents: ['vault'], modifiedTime: '2026-01-01T00:00:00Z' },
    ];
    if (url.pathname.endsWith('/files') && route.request().method() === 'GET') {
      await route.fulfill({ json: { files: url.searchParams.get('q')?.includes('.web-notes.json') ? [] : files } });
    } else if (url.searchParams.get('alt') === 'media') {
      await route.fulfill({ contentType: 'text/plain', body: url.pathname.endsWith('/welcome') ? '# Welcome\n\nA browser-tested note.\n' : '# Second\n\nAnother note.\n' });
    } else {
      await route.fulfill({ status: 500, json: { error: { message: `Unexpected test request: ${url.pathname}` } } });
    }
  });
});

test('opens rich text, switches to source, and follows browser history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/note/Welcome.md');
  await expect(page.locator('.rich-markdown-content')).toContainText('A browser-tested note.');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('A browser-tested note.');
  await page.getByRole('combobox', { name: 'Find notes by title' }).fill('Second');
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/Second/);
  await expect(page.locator('.rich-markdown-content, .cm-content')).toContainText('Another note.');
  await page.goBack();
  await expect(page.locator('.rich-markdown-content, .cm-content')).toContainText('A browser-tested note.');
  expect(errors).toEqual([]);
});

test('retains cached note after reload when Drive is unavailable', async ({ page }) => {
  await page.goto('/#/note/Welcome.md');
  await expect(page.locator('.rich-markdown-content')).toContainText('A browser-tested note.');
  await page.route('https://www.googleapis.com/**', (route) => route.fulfill({ status: 503, json: { error: { message: 'Drive unavailable' } } }));
  await page.reload();
  await expect(page.locator('.rich-markdown-content, .cm-content')).toContainText('A browser-tested note.');
  await expect(page.getByText(/Showing cached files/)).toBeVisible();
});

test('autosaves rich-text changes through the Drive adapter', async ({ page }) => {
  let savedText = '';
  await page.route('https://www.googleapis.com/upload/drive/v3/files/welcome?*', async (route) => {
    expect(route.request().method()).toBe('PATCH');
    savedText = route.request().postData() ?? '';
    await route.fulfill({ json: {
      id: 'welcome', name: 'Welcome.md', mimeType: 'text/markdown',
      parents: ['vault'], modifiedTime: '2026-01-02T00:00:00Z',
    } });
  });
  await page.goto('/#/note/Welcome.md');
  const editor = page.locator('.rich-markdown-content');
  await expect(editor).toContainText('A browser-tested note.');
  await editor.fill('Edited in a real browser');
  await expect.poll(() => savedText).toContain('Edited in a real browser');
  await expect(editor).toContainText('Edited in a real browser');
});
