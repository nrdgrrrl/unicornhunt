import { boot } from './src/app.js';
// Boot once here; module caching gives every importer the same game instance.
export const game = boot(document.querySelector('#game'));
