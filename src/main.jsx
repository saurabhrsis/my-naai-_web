import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { getErrorMessage } from './components/Shared';
import './styles.css';

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
