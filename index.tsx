import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { initInstall } from './services/pwa';
import './index.css';

// Inter (preloaded in index.html). Applied here instead of an inline onload
// handler so the page works under a strict Content-Security-Policy.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
if (!document.querySelector(`link[rel="stylesheet"][href="${FONT_CSS}"]`)) {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = FONT_CSS;
  document.head.appendChild(font);
}

// Listen for beforeinstallprompt as early as possible (the install button uses it).
initInstall();

// OAuth consent for MCP connectors (claude.ai, ChatGPT) lives outside the app shell.
const OAuthConsent = lazyWithRetry(() => import('./components/views/OAuthConsent'));
const isOAuth = window.location.pathname.startsWith('/oauth/authorize');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isOAuth ? <React.Suspense fallback={null}><OAuthConsent /></React.Suspense> : <App />}
  </React.StrictMode>
);
