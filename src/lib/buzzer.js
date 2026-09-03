/*
 * My Naai booking buzzer.
 *
 * Replays the exact buzzer sound the My Naai mobile app uses (the Notifee
 * `buzzer` / `buzzer_old` sounds from android/app/src/main/res/raw in
 * rightserveinfotechsystems/my_naai_app) for time-critical booking notifications.
 *
 * Time-critical alerts (a salon booking request, a delay proposal) buzz + pulse
 * the device; informational messages stay silent by design.
 *
 * Platform notes
 * --------------
 * - Sound uses the Web Audio API, which browsers only let play after a user
 *   gesture (autoplay policy). On a background/closed app the OS notification
 *   sound is controlled by the push payload the server sends; the client
 *   service worker can only pulse the device. `unlockBuzzer()` is called on the
 *   first user interaction to unlock (and preload) audio for the session.
 * - Vibration works on Android Chrome and a few other mobile browsers; desktop
 *   ignores `navigator.vibrate`.
 */

const SOUNDS = {
  booking: '/assets/audio/buzzer_old.wav', // mobile 'booking' channel
  default: '/assets/audio/buzzer.wav',      // mobile 'default_channel'
};

let audioContext = null;
let unlocked = false;
const buffers = {};   // url -> Promise<AudioBuffer>
const bufferFailed = {}; // url -> true (fall back to synthetic tone)

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch (error) {
    return null;
  }
}

// Decode the real buzzer file into an AudioBuffer we can replay instantly.
function loadBuffer(url) {
  if (buffers[url]) return buffers[url];
  buffers[url] = (async () => {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('No AudioContext');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}`);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
  })().catch(error => {
    bufferFailed[url] = true;
    delete buffers[url];
    throw error;
  });
  return buffers[url];
}

function playSynthetic(ctx, { frequency, start, duration, volume }) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square'; // square wave reads as the shop-buzzer rasp
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

// Vibrate the device like the buzzer. Returns whether vibration was issued.
export function vibrate(pattern = [260, 120, 260, 120, 520]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    navigator.vibrate(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

function soundForType(type = '') {
  const value = String(type || '').toUpperCase();
  // Booking requests use the piercing `buzzer_old`; secondary alerts use `buzzer`.
  return value === 'BOOKING_REQUEST' || value === 'DELAY_BOOKING' ? SOUNDS.booking : SOUNDS.default;
}

export function isBuzzerSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

// Called from the app on the first user interaction so the AudioContext is
// allowed to produce sound (and the buzzer file is preloaded) later without a
// gesture.
export function unlockBuzzer() {
  if (unlocked) return;
  unlocked = true;
  const ctx = getAudioContext();
  if (!ctx) return;
  // Preload the real buzzer files so a push can fire immediately.
  loadBuffer(SOUNDS.booking).catch(() => {});
  loadBuffer(SOUNDS.default).catch(() => {});
}

// Play the real My Naai buzzer (or a synthetic pulse if the file/stream is
// unavailable) plus a device vibration. Returns true when a sound was started.
export function playBuzzer({ type = '', repeats = 2 } = {}) {
  vibrate(type === 'BOOKING_REQUEST' ? [260, 120, 260, 120, 520] : [300, 140, 300, 140, 500]);

  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state !== 'running' && ctx.state !== 'interrupted') {
    try { ctx.resume().catch(() => {}); } catch (error) { /* ignore */ }
    if (ctx.state !== 'running') return false;
  }

  const url = soundForType(type);

  // Prefer the real mobile buzzer file.
  if (!bufferFailed[url]) {
    loadBuffer(url)
      .then(buffer => {
        const current = getAudioContext();
        if (!current || current.state !== 'running') return;
        // Play it a couple of times so it reads as a buzzer burst.
        let offset = 0;
        for (let i = 0; i < Math.max(1, Math.min(3, repeats || 1)); i += 1) {
          const source = current.createBufferSource();
          const gain = current.createGain();
          source.buffer = buffer;
          gain.gain.setValueAtTime(0.9, current.currentTime + offset);
          source.connect(gain);
          gain.connect(current.destination);
          source.start(current.currentTime + offset);
          offset += buffer.duration + 0.15;
        }
      })
      .catch(() => {
        // Fall through to the synthetic pulse below.
        playSyntheticSequence(ctx, repeats);
      });
    return true;
  }

  // File failed — fall back to a synthetic buzzer pulse.
  playSyntheticSequence(ctx, repeats);
  return true;
}

function playSyntheticSequence(ctx, repeats) {
  const count = Math.max(1, Math.min(6, repeats || 2));
  const now = ctx.currentTime;
  const step = 0.52;
  const on = 0.3;
  for (let i = 0; i < count; i += 1) {
    playSynthetic(ctx, { frequency: 920, start: now + i * step, duration: on, volume: 0.32 });
    playSynthetic(ctx, { frequency: 700, start: now + i * step + 0.05, duration: on * 0.72, volume: 0.3 });
  }
}
