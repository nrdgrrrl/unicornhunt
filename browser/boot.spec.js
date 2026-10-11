import { test, expect, origin } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Observe callback ownership only; stepping belongs to the app suite.
    const frames = new Map();
    let id = 0;
    window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
    window.cancelAnimationFrame = id => frames.delete(id);
    window.pendingFrames = () => frames.size;
  });
});

test('both boot paths export the same function without scheduling another loop', async ({ page }) => {
  await page.goto(origin);
  expect(await page.evaluate(() => pendingFrames())).toBe(1);
  const result = await page.evaluate(async () => {
    const app = await import('/src/app.js');
    const afterApp = pendingFrames();
    const compatibility = await import('/src/bootstrap.js');
    return { sameBoot: app.boot === compatibility.boot, afterApp, afterCompatibility: pendingFrames() };
  });
  expect(result).toEqual({ sameBoot: true, afterApp: 1, afterCompatibility: 1 });
});

for (const firstPath of ['/src/app.js', '/src/bootstrap.js']) {
  test(`importing ${firstPath} before main does not create a game`, async ({ page }) => {
    // Keep the real page's canvas and menus, but let the test import the entry.
    await page.route(`${origin}/`, async route => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({
        response,
        body: html.replace('<script type="module" src="./main.js"></script>', ''),
      });
    });
    await page.goto(origin);
    expect(await page.evaluate(() => pendingFrames())).toBe(0);
    const result = await page.evaluate(async firstPath => {
      const first = await import(firstPath);
      const afterFirst = pendingFrames();
      const otherPath = firstPath === '/src/app.js' ? '/src/bootstrap.js' : '/src/app.js';
      const other = await import(otherPath);
      return { sameBoot: first.boot === other.boot, afterFirst, afterOther: pendingFrames() };
    }, firstPath);
    expect(result).toEqual({ sameBoot: true, afterFirst: 0, afterOther: 0 });
    await expect(page.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0);
    expect(await page.evaluate(async () => {
      const { game } = await import('/main.js');
      return { state: game.state, frames: pendingFrames() };
    })).toEqual({ state: 'title', frames: 1 });
    await expect(page.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(1);
  });
}

test('repeated main imports share one game and destroy cancels its only callback', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const first = await import('/main.js');
    const second = await import('/main.js');
    const sameGame = first.game === second.game;
    const beforeDestroy = pendingFrames();
    first.game.destroy();
    const afterDestroy = pendingFrames();
    second.game.destroy();
    const afterSecondDestroy = pendingFrames();
    await import('/src/bootstrap.js');
    await import('/src/app.js');
    const third = await import('/main.js');
    return {
      sameGame, beforeDestroy, afterDestroy, afterSecondDestroy,
      sameAfterDestroy: third.game === first.game,
      afterReimports: pendingFrames(),
    };
  });
  expect(result).toEqual({
    sameGame: true, beforeDestroy: 1, afterDestroy: 0, afterSecondDestroy: 0,
    sameAfterDestroy: true, afterReimports: 0,
  });
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0);
});
