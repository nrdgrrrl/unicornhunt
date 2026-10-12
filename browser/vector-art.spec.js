import { test, expect, origin, controlledClock, attachJSON } from './fixtures.js';

for (const dpr of [1, 2]) {
  test.describe(`production artwork at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1320, height: 900 } });

    // At 1.8 tiles even ground-level supplies fit inside the horizontal camera.
    for (const [distanceName, distance] of [['normal', 3], ['close', 1.8]]) {
      test(`${distanceName} survival artwork and rear emission`, async ({ page, browser }, testInfo) => {
        await controlledClock(page);
        await page.goto(`${origin}/?seed=1`);
        const evidence = await page.evaluate(async ({ distanceName, distance }) => {
          const { game } = await import('/main.js');
          game.destroy();
          const { createRenderer } = await import('/src/renderer.js');
          const { createVectorArt } = await import('/src/vector-art.js');
          const { GameSession } = await import('/src/session.js');
          const { updateRangedAttacks } = await import('/src/ranged-attacks.js');
          const { updateRoses } = await import('/src/projectiles.js');
          const art = createVectorArt();
          const root = document.createElement('main');
          root.style.cssText = 'display:grid;grid-template-columns:640px 640px;gap:12px;padding:12px;background:#fff8e8';
          document.body.replaceChildren(root);
          const heading = document.createElement('h1');
          heading.style.cssText = 'grid-column:1 / -1;font:20px system-ui;margin:0';
          heading.textContent = `Production vector artwork · ${distanceName} (${distance} tiles) · DPR ${devicePixelRatio}`;
          root.append(heading);
          const scenes = [];
          for (const kind of ['unicorn', 'rear-emission', 'supplies', 'airborne-rose']) {
            const panel = document.createElement('section');
            const label = document.createElement('p');
            label.style.cssText = 'font:16px system-ui;margin:0 0 4px';
            label.textContent = kind;
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width:640px;height:360px';
            panel.append(label, canvas);
            root.append(panel);
            const session = new GameSession(1).start();
            // A controlled clearing isolates artwork from maze occlusion. All
            // drawing still uses the production renderer and its vector cache.
            for (let y = 1; y < session.world.height - 1; y++) {
              for (let x = 1; x < session.world.width - 1; x++) session.world.tiles[y * session.world.width + x] = 0;
            }
            session.world.decorations = [];
            const actor = session.unicorns[0];
            actor.x = session.player.x + distance;
            actor.y = session.player.y;
            session.unicorns = kind === 'unicorn' || kind === 'rear-emission' ? [actor] : [];
            if (kind === 'supplies') {
              session.pickups = ['health', 'armor'].map((kind, i) => ({
                id: kind, kind, x: session.player.x + distance,
                y: session.player.y + (i ? 1 : -1) * distance * 0.28, radius: 0.2,
              }));
            } else session.pickups = [];
            if (kind === 'rear-emission') {
              actor.x += 0.35;
              actor.angle = 0;
              Object.assign(actor.attack, { phase: 'windup', facing: 0, remaining: 1 / 60,
                cooldownFor: 0, target: { x: session.player.x, y: session.player.y } });
              const events = updateRangedAttacks(session.unicorns, session.world, session.player, session, 1 / 60);
              if (events.length !== 1) throw new Error('Artwork fixture did not emit a production rose');
            }
            if (kind === 'airborne-rose') {
              // Emission from the same production state machine, now advanced in flight.
              const source = { ...actor, x: actor.x + 0.35 + 3.5 * 0.05, angle: 0,
                attack: { phase: 'windup', facing: 0, remaining: 1 / 60, cooldownFor: 0,
                  target: { x: session.player.x, y: session.player.y } } };
              updateRangedAttacks([source], session.world, session.player, session, 1 / 60);
              session.roses = updateRoses(session.roses, session.world, session.player, session.player, 0.05).roses;
            }
            const renderer = createRenderer(canvas, { responsive: true });
            const drawn = new Set();
            const draw = renderer.ctx.drawImage.bind(renderer.ctx);
            renderer.ctx.drawImage = (...args) => {
              for (const name of ['unicorn', 'unicornRear', 'healthCake', 'armorCharm', 'rose', 'weapon']) {
                if (args[0] === art[name]) drawn.add(name);
              }
              draw(...args);
            };
            renderer.render(session);
            const bounds = canvas.getBoundingClientRect();
            scenes.push({ kind, drawn: [...drawn].sort(),
              css: { width: bounds.width, height: bounds.height },
              backing: { width: canvas.width, height: canvas.height },
              roses: structuredClone(session.roses),
            });
          }
          return { seed: 1, devicePixelRatio, distanceName, distanceTiles: distance,
            fixture: 'isolated production renderer in a controlled clearing', scenes,
            atlas: { width: art.unicorn.width, height: art.unicorn.height },
            humanThemeReview: 'pending', humanRecognitionReview: 'pending' };
        }, { distanceName, distance });
        expect(evidence.devicePixelRatio).toBe(dpr);
        expect(evidence.atlas).toEqual({ width: 512, height: 640 });
        for (const scene of evidence.scenes) {
          expect(scene.css).toEqual({ width: 640, height: 360 });
          expect(scene.backing).toEqual({ width: 640 * dpr, height: 360 * dpr });
        }
        expect(evidence.scenes.map(scene => scene.drawn)).toEqual([
          ['unicorn', 'weapon'], ['rose', 'unicornRear', 'weapon'],
          ['armorCharm', 'healthCake', 'weapon'], ['rose', 'weapon'],
        ]);
        const emission = evidence.scenes[1].roses[0];
        expect(emission.x).toBeCloseTo(3.5 + distance, 10);
        expect(emission.y).toBe(12.5);
        const name = `artwork-${distanceName}-dpr-${dpr}`;
        const path = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path, fullPage: true });
        await testInfo.attach(name, { path, contentType: 'image/png' });
        await attachJSON(testInfo, name, { ...evidence, browser: browser.version() });
      });
    }
  });
}
