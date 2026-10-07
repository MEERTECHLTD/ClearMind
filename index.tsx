import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// OAuth consent for MCP connectors (claude.ai, ChatGPT) lives outside the app shell.
const OAuthConsent = React.lazy(() => import('./components/views/OAuthConsent'));
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
