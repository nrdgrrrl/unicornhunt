import { writeFile } from 'node:fs/promises';
import { test, expect, origin, attachJSON } from './fixtures.js';

test('all eight effects render non-silent, unclipped audio and produce audition clips', async ({ page }, testInfo) => {
  await page.goto(origin);
  const observations = [];
  for (const type of ['shot', 'glitter', 'damage', 'wave', 'victory', 'defeat', 'pickup', 'rose-fired']) {
    const rendered = await page.evaluate(async type => {
      const { createAudio } = await import('/src/audio.js');
      const sampleRate = 24000;
      const context = new OfflineAudioContext(1, sampleRate * 1.2, sampleRate);
      // Offline rendering uses the production synthesis graph/envelopes. Only
      // lifecycle methods are adapted, since an offline context cannot resume.
      const audio = createAudio({
        storage: () => null,
        contextFactory: () => ({
          get state() { return 'running'; },
          get currentTime() { return context.currentTime; },
          get destination() { return context.destination; },
          createGain: () => context.createGain(),
          createOscillator: () => context.createOscillator(),
          resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
        }),
      });
      await audio.activate();
      audio.consume([{ type }]);
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      let peak = 0;
      let sum = 0;
      for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
      // PCM WAV: a portable artifact for a person's listening review.
      const bytes = new Uint8Array(44 + samples.length * 2);
      const view = new DataView(bytes.buffer);
      const label = (offset, value) => [...value].forEach((char, i) => { bytes[offset + i] = char.charCodeAt(0); });
      label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data');
      view.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(samples[i] * 32767), true);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      audio.destroy();
      return { wav: btoa(binary), peak, rms: Math.sqrt(sum / samples.length), sampleRate, seconds: buffer.duration };
    }, type);
    expect(rendered.peak, `${type} has audible samples`).toBeGreaterThan(0.01);
    expect(rendered.peak, `${type} does not clip`).toBeLessThan(1);
    expect(rendered.rms).toBeGreaterThan(0.001);
    const path = testInfo.outputPath(`${type}.wav`);
    await writeFile(path, Buffer.from(rendered.wav, 'base64'));
    await testInfo.attach(`sound-${type}`, { path, contentType: 'audio/wav' });
    const { wav, ...metrics } = rendered;
    observations.push({ type, ...metrics });
  }
  await attachJSON(testInfo, 'audio-samples', observations);
});
