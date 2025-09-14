/* Brain ⚡ Bolt — Service Worker */
const VERSION = 'v1.8.0';  // bump: splash + sounds + timer + progress
const STATIC_CACHE = `bb-static-${VERSION}`;
const RUNTIME_CACHE = `bb-runtime-${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-config.js',
  '/site.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/app-icon.svg',
  '/header-graphic.svg',
  '/about.html',
  '/terms.html',
  '/p
