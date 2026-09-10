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
  await page.keyboard.press('Control+K');
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

test('block background colours save as comments and survive reloading', async ({ page }) => {
  let savedText = '';
  await page.route('https://www.googleapis.com/upload/drive/v3/files/welcome?*', async (route) => {
    savedText = route.request().postData() ?? '';
    await route.fulfill({ json: { id: 'welcome', name: 'Welcome.md', mimeType: 'text/markdown', parents: ['vault'], modifiedTime: '2026-01-02T00:00:00Z' } });
  });
  await page.goto('/#/note/Welcome.md');
  const paragraph = page.locator('.rich-markdown-content p').filter({ hasText: 'A browser-tested note.' });
  await paragraph.hover();
  await page.getByRole('button', { name: 'Move block' }).click();
  await page.getByRole('menuitemradio', { name: 'yellow background' }).click();
  await expect(paragraph).toHaveCSS('background-color', 'rgb(250, 240, 196)');
  await expect.poll(() => savedText).toContain('<!-- web-notes:background=yellow -->');
  await page.route('https://www.googleapis.com/drive/v3/files/welcome?*', route => route.fulfill({ contentType: 'text/plain', body: savedText }));
  await page.reload();
  await expect(paragraph).toHaveAttribute('data-block-background', 'yellow');
  await expect(page.getByText(/Rich text normalization changed/)).toHaveCount(0);
});

test('coloured list items extend their highlight behind native markers', async ({ page }) => {
  await page.route('https://www.googleapis.com/drive/v3/files/welcome?*', route => route.fulfill({
    contentType: 'text/plain',
    body: [
      '- Bullet <!-- web-notes:background=green -->',
      '',
      '1. Ordered <!-- web-notes:background=blue -->',
      '',
      '- [ ] Todo <!-- web-notes:background=red -->',
    ].join('\n'),
  }));
  await page.goto('/#/note/Welcome.md');

  const bulletShadow = await page.locator('li').filter({ hasText: 'Bullet' }).evaluate(element => getComputedStyle(element).boxShadow);
  const orderedShadow = await page.locator('li').filter({ hasText: 'Ordered' }).evaluate(element => getComputedStyle(element).boxShadow);
  const todoShadow = await page.locator('li[role="checkbox"]').evaluate(element => getComputedStyle(element).boxShadow);

  expect(bulletShadow).toContain('-24px 0px 0px 3px');
  expect(orderedShadow).toContain('-32px 0px 0px 3px');
  expect(todoShadow).not.toContain('-24px 0px 0px 3px');
  expect(todoShadow).not.toContain('-32px 0px 0px 3px');
});

test('aligns rich checklist text and markers with ordinary list content', async ({ page }) => {
  await page.route('https://www.googleapis.com/drive/v3/files/welcome?*', route => route.fulfill({
    contentType: 'text/plain',
    body: '- Ordinary item\n\nParagraph\n\n- [ ] To-do item <!-- web-notes:background=green -->',
  }));
  await page.goto('/#/note/Welcome.md');

  const ordinary = page.locator('.rich-markdown-content li').filter({ hasText: 'Ordinary item' });
  const todo = page.locator('.rich-markdown-content li[role="checkbox"]');
  await expect(todo).toHaveAttribute('data-block-background', 'green');
  const alignment = await Promise.all([ordinary, todo].map(async (item) => {
    const text = item.locator('[data-lexical-text]').first();
    return { item: await item.boundingBox(), text: await text.boundingBox() };
  }));
  expect(Math.abs(alignment[0].text!.x - alignment[1].text!.x)).toBeLessThanOrEqual(1);
  // The checklist LI extends into the marker gutter while its padded text
  // remains aligned with an ordinary list item. Lexical uses this wider box
  // to hit-test clicks on the generated checkbox marker.
  expect(alignment[0].item!.x - alignment[1].item!.x).toBeCloseTo(24, 0);

  const verticalOffset = await todo.evaluate((element) => {
    const row = getComputedStyle(element);
    const marker = getComputedStyle(element, '::before');
    return Math.abs(Number.parseFloat(marker.top) + Number.parseFloat(marker.height) / 2 - Number.parseFloat(row.lineHeight) / 2);
  });
  expect(verticalOffset).toBeLessThanOrEqual(1);

  const todoBox = await todo.boundingBox();
  expect(todoBox).not.toBeNull();
  await todo.click({ position: { x: 8, y: todoBox!.height / 2 } });
  await expect(todo).toHaveAttribute('aria-checked', 'true');
});

test('hides a block grabber when its block scrolls behind the note header', async ({ page }) => {
  const body = Array.from({ length: 50 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n');
  await page.route('https://www.googleapis.com/drive/v3/files/welcome?*', route => route.fulfill({
    contentType: 'text/plain',
    body,
  }));
  await page.goto('/#/note/Welcome.md');

  await page.locator('.rich-markdown-content p').first().hover();
  const handle = page.getByRole('button', { name: 'Move block' });
  await expect(handle).toBeVisible();

  await page.locator('.mdxeditor-root-contenteditable').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(handle).toBeHidden();
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

for (const width of [320, 390]) {
  test(`mobile ${width}px keeps the note full width and uses a dismissible file drawer`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/note/Welcome.md');
    const editor = page.locator('.rich-markdown-content');
    await expect(editor).toContainText('A browser-tested note.');
    await expect(page.getByRole('button', { name: 'Show file sidebar' })).toBeVisible();
    const viewer = await page.locator('.workspace-viewer').boundingBox();
    expect(viewer?.width).toBe(width);
    expect(viewer!.y).toBeLessThan(90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath('mobile.png') });
    await page.getByRole('button', { name: 'Show file sidebar' }).click();
    await expect(page.getByRole('complementary', { name: 'Vault files' })).toBeVisible();
    await expect(page.locator('.sidebar-container')).toHaveCSS('left', '0px');
    await expect(page.locator('.sidebar')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath('drawer.png') });
    await page.locator('.tree-item').filter({ hasText: 'Second' }).click();
    await expect(editor).toContainText('Another note.');
    await expect(page.getByRole('button', { name: 'Show file sidebar' })).toBeVisible();
    await page.getByRole('button', { name: 'Show file sidebar' }).click();
    await page.getByRole('button', { name: 'Close file sidebar', exact: true }).click({ position: { x: width - 8, y: 120 } });
    await expect(page.getByRole('button', { name: 'Show file sidebar' })).toBeFocused();
    await page.getByRole('button', { name: 'Show file sidebar' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Show file sidebar' })).toBeFocused();
    await page.getByRole('button', { name: 'Show file sidebar' }).click();
    await page.getByRole('button', { name: 'Open options menu' }).click();
    await page.getByRole('menuitem', { name: 'Dark mode' }).click();
    await expect(page.locator('.header-menu-popover')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('dark.png') });
  });
}
