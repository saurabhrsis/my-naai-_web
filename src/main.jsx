import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getErrorMessage } from './components/Shared';
import { installDevToolsErrorShield } from './lib/devtoolsShield';
import './styles.css';

// Swallow the known Chrome DevTools Performance-panel internal crash
// (reportAllChanges/startTime) so it stops polluting the console.
installDevToolsErrorShield();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.debug(getErrorMessage(error, 'Offline app shell is unavailable; continuing online.'));
      // The app remains fully usable when service workers are unavailable.
    });
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
