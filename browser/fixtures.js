import { test as base, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export const origin = 'http://127.0.0.1:4174';

export async function attachJSON(testInfo, name, value) {
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

function local(url) {
  return new URL(url).origin === origin;
}

// Installed before navigation for every suite, including the subsystem tests.
export const test = base.extend({
  browserHealth: [async ({ page, browser }, use, testInfo) => {
    const failures = [];
    const onError = error => failures.push(`Uncaught error: ${error.stack || error.message}`);
    const onResponse = response => {
      if (local(response.url()) && response.status() >= 400) {
        failures.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    };
    const onRequestFailed = request => {
      if (local(request.url())) failures.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`);
    };
    page.on('pageerror', onError);
    page.on('response', onResponse);
    page.on('requestfailed', onRequestFailed);
    await use();
    await attachJSON(testInfo, 'browser-health', { browser: browser.version(), failures });
    page.off('pageerror', onError);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
    expect(failures, 'Browser errors and failed local resources').toEqual([]);
  }, { auto: true }],
});

export { expect };
