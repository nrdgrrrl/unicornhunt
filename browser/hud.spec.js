import { test, expect, origin, controlledClock, stepFrames as step } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  // Three simulation ticks per frame, including the two-second intermission.
  await controlledClock(page, 50);
  await page.goto(origin);
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
});

test('the focused primary action stays inside the scrollable panel on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeFocused();
  const visible = await page.evaluate(() => {
    const panel = document.querySelector('.panel').getBoundingClientRect();
    const action = document.querySelector('#start').getBoundingClientRect();
    return action.top >= panel.top && action.bottom <= panel.bottom;
  });
  expect(visible).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  const badgesFit = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    return [...document.querySelectorAll('.badge')].every(badge => {
      const bounds = badge.getBoundingClientRect();
      return bounds.left >= stage.left && bounds.right <= stage.right
        && bounds.top >= stage.top && bounds.bottom <= stage.bottom;
    });
  });
  expect(badgesFit).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeFocused();
});

test('all menu actions work with keyboard focus and no pointer lock', async ({ page }) => {
  const start = page.getByRole('button', { name: 'Start game', exact: true });
  await expect(start).toBeFocused();
  await expect(page.locator('#instructions')).toContainText('Clear three waves: 6, 8, then 10');
  await expect(page.locator('#instructions')).toContainText('unlimited rainbows');
  await expect(page.locator('#instructions')).toContainText('Armor absorbs');
  await expect(page.locator('#instructions')).toContainText("unicorn's rear");
  await expect(page.locator('#instructions')).toContainText('Rainbow cakes restore one health point');
  await expect(page.locator('#instructions')).toContainText('star-shield charms add one armor point');
  await expect(page.locator('.controls')).toContainText('Alt + ← / →');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mute')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.keyboard.down('Space');
  await step(page, 2);
  await page.keyboard.up('Space');
  await expect(page.locator('#score')).toHaveText('100');
  await expect(page.locator('#best-score')).toHaveText('100');
  await expect(page.locator('#combo')).toHaveText('×1');
  await expect(page.locator('#remaining')).toHaveText('5');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeFocused();
  const paused = await page.evaluate(() => ({ elapsed: game.session.elapsed, stats: document.querySelector('.hud').textContent }));
  await step(page, 50);
  expect(await page.evaluate(() => ({ elapsed: game.session.elapsed, stats: document.querySelector('.hud').textContent }))).toEqual(paused);
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  await expect(page.locator('#announcement')).toHaveText('Game resumed');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await expect(page.locator('#best-score')).toHaveText('100');
  await page.reload();
  await expect(start).toBeFocused();
  await expect(page.locator('#best-score')).toHaveText('100');
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
});

test('frame updates preserve controls and focus and announce only meaningful transitions', async ({ page }) => {
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.locator('#mute').focus();
  await page.evaluate(() => {
    window.primaryNode = document.querySelector('#start');
    window.soundNode = document.querySelector('#mute');
    window.healthNode = document.querySelector('#health');
    window.armorNode = document.querySelector('#armor');
    window.announcements = [];
    const status = document.querySelector('#announcement');
    window.observer = new MutationObserver(() => announcements.push(status.textContent));
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    game.session.score = 250;
    game.session.combo = 2;
    game.session.player.health = 3;
    game.session.player.armor = 2;
  });
  await step(page, 10);
  await expect(page.locator('#score')).toHaveText('250');
  await expect(page.locator('#health')).toHaveText('3 / 5');
  await expect(page.locator('#armor')).toHaveText('2 / 5');
  await expect(page.locator('#mute')).toBeFocused();
  expect(await page.evaluate(() => primaryNode === document.querySelector('#start') && soundNode === document.querySelector('#mute'))).toBe(true);
  expect(await page.evaluate(() => healthNode === document.querySelector('#health') && armorNode === document.querySelector('#armor'))).toBe(true);
  expect(await page.evaluate(() => announcements)).toEqual([]);
  expect(await page.locator('.hud').getAttribute('aria-live')).toBeNull();
  await page.evaluate(() => { game.session.unicorns.forEach(unicorn => { unicorn.alive = false; }); });
  await step(page, 41);
  await expect(page.locator('#announcement')).toHaveText('Wave 2 of 3. 8 unicorns remaining.');
  expect(await page.evaluate(() => announcements)).toEqual(['Wave 2 of 3. 8 unicorns remaining.']);
  await step(page, 5);
  expect(await page.evaluate(() => announcements.length)).toBe(1);
});

test('victory and defeat announce final scores, focus restart, and begin a fresh game', async ({ page }) => {
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.evaluate(() => { game.session.score = 400; });
  for (let wave = 1; wave <= 3; wave++) {
    await page.evaluate(() => { game.session.unicorns.forEach(unicorn => { unicorn.alive = false; }); });
    await step(page, 42);
  }
  await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible();
  await expect(page.locator('#message')).toContainText('Final score: 400. Best score: 400.');
  await expect(page.locator('#announcement')).toContainText('Victory!');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
  await step(page, 5);
  await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    game.session.player.health = 1;
    game.session.unicorns[0].x = game.session.player.x;
    game.session.unicorns[0].y = game.session.player.y;
  });
  await step(page, 2);
  await expect(page.getByRole('heading', { name: 'Defeat', exact: true })).toBeVisible();
  await expect(page.locator('#health')).toHaveText('0 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await expect(page.locator('#message')).toContainText('Your health ran out.');
  await expect(page.locator('#message')).toContainText('Final score: 0. Best score: 400.');
  await expect(page.locator('#announcement')).toContainText('Defeat');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => game.state)).toBe('playing');
  await expect(page.locator('#game')).toBeFocused();
  await expect(page.locator('#wave')).toHaveText('1 / 3');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
});

for (const failure of ['unsupported', 'activation failure']) {
  test(`silent mode reports ${failure} audio and preserves mute preference`, async ({ page }) => {
    await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
    await page.evaluate(failure => {
      window.AudioContext = failure === 'unsupported' ? undefined : class {
        constructor() { throw new Error('Audio denied'); }
      };
      window.webkitAudioContext = undefined;
    }, failure);
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await step(page, 2);
    await expect(page.locator('#mute')).toHaveText('Silent mode — audio unavailable');
    await expect(page.locator('#mute')).toBeDisabled();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#audio-status')).toHaveText('Silent mode: audio is unavailable.');
    await page.keyboard.down('Space');
    await step(page);
    await page.keyboard.up('Space');
    await expect(page.locator('#score')).toHaveText('100');
    expect(await page.evaluate(() => game.state)).toBe('playing');
  });
}

test('blocked storage still supports best score and restart during this visit', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await page.reload();
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
  await page.keyboard.press('Enter');
  await page.keyboard.down('Space');
  await step(page, 2);
  await page.keyboard.up('Space');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#best-score')).toHaveText('100');
  expect(await page.evaluate(() => game.state)).toBe('playing');
});
