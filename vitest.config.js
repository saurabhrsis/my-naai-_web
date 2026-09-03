import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test/setup.js'],
    env: {
      VITE_FIREBASE_API_KEY: 'api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-project',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '9999999999',
      VITE_FIREBASE_APP_ID: '1:9999999999:web:demo',
      VITE_FIREBASE_VAPID_KEY: 'vapid-key',
      VITE_API_BASE_URL: 'https://backend.mynaai.in',
    },
  },
});
