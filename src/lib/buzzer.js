/*
 * MyNaai booking buzzer.
 *
 * Time-critical MyNaai notifications (a salon booking request, a delay
 * proposal) sound a short, repeating buzzer the way the mobile app does, and
 * pulse the device. Informational messages stay silent — the buzzer is reserved
 * for a bookable action that needs the person to look up.
 *
 * Platform notes
 * --------------
 * - Sound uses the Web Audio API, which browsers only let play after a user
 *   gesture (autoplay policy). On a background/closed app the OS notification
 *   sound is controlled by the push payload the server sends; the client
 *   service worker can only pulse the device. `unlockBuzzer()` is called on the
 *   first user interaction to unlock audio for the session.
 * - Vibration works on Android Chrome and a few other mobile browsers; desktop
 *   ignores `navigator.vibrate`.
 */

let audioContext = null;
let unlocked = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!audioContext) audioContext = new Ctor();
    // A browser-created AudioContext starts `suspended`; resume once allowed so
    // a later push can actually produce sound.
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch (error) {
    return null;
  }
}

function tone(ctx, { frequency, start, duration, volume }) {
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

// Vibrate the device like a buzzer. Returns whether vibration was issued.
export function vibrate(pattern = [300, 140, 300, 140, 500]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    navigator.vibrate(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

export function isBuzzerSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

// Called from the app on the first user interaction so the AudioContext is
// allowed to produce sound later without a gesture.
export function unlockBuzzer() {
  if (unlocked) return;
  unlocked = true;
  getAudioContext();
}

// Play `repeats` double-beeps (a buzzer pulse) plus a device vibration.
// Returns true when a sound was actually started.
export function playBuzzer({ type = '', repeats = 2 } = {}) {
  // Always pulse the device — allowed without a gesture where supported.
  vibrate(type === 'BOOKING_REQUEST' ? [260, 120, 260, 120, 520] : [300, 140, 300, 140, 500]);

  const ctx = getAudioContext();
  if (!ctx) return false;
  // A suspended AudioContext is not audible until the gesture policy allows it;
  // calling getAudioContext() resumes it, but if still suspended just bail.
  if (ctx.state !== 'running' && ctx.state !== 'interrupted') {
    try { ctx.resume().catch(() => {}); } catch (error) { /* ignore */ }
    if (ctx.state !== 'running') return false;
  }

  const count = Math.max(1, Math.min(6, repeats || 2));
  const now = ctx.currentTime;
  const step = 0.52; // gap between the two-tone pulses
  const on = 0.3;    // single beep duration
  for (let i = 0; i < count; i += 1) {
    tone(ctx, { frequency: 920, start: now + i * step, duration: on, volume: 0.32 });
    tone(ctx, { frequency: 700, start: now + i * step + 0.05, duration: on * 0.72, volume: 0.3 });
  }
  return true;
}
