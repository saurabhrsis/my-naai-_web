// Suppresses a known Chrome DevTools internal crash that shows up in the
// My Naai console as:
//
//   Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
//     at et.reportAllChanges (<anonymous>:2:19429)
//     at <anonymous>:2:13070 ...
//
// That stack comes from Chrome's own DevTools Performance-panel helper script
// (evaluated into the page as an anonymous VM script), not from any My Naai or
// vendor code — the identical signature and offsets are documented in
// angular/angular#70464 and it only fires while DevTools is open. Nothing in
// this repository reads a `startTime` property outside
// `BookingRequestScreen`, and that access is optional-chained
// (`details?.startTime`).
//
// We swallow exactly this known-broken signature so it stops masking real
// errors; every other error is reported untouched. The same guard is installed
// inline in index.html so the shield is active before the bundle even loads.
const KNOWN_MESSAGE = /reading 'startTime'/;
const KNOWN_FRAME = /\breportAllChanges\b/;
// DevTools evaluates the failing helper into an anonymous VM script, so the
// ErrorEvent can arrive with no usable stack and a filename of "<anonymous>".
const KNOWN_SOURCE = /^(<anonymous>|devtools:|chrome-extension:)/i;
const FLAG = '__mynaaiDevToolsShieldInstalled';

export function isDevToolsPerformanceNoise({ message = '', stack = '', filename = '' } = {}) {
  if (!KNOWN_MESSAGE.test(String(message))) return false;
  if (KNOWN_FRAME.test(String(stack))) return true;
  return !stack || KNOWN_SOURCE.test(String(filename));
}

export function installDevToolsErrorShield() {
  if (typeof window === 'undefined' || window[FLAG]) return;
  window[FLAG] = true;
  const ignore = () => console.debug('Ignored a known Chrome DevTools Performance-panel internal error (reportAllChanges/startTime). It is not caused by My Naai.');

  // Capture phase: run before app-level listeners and React's error handling so
  // the noise cannot bubble up as an "Uncaught" console error.
  window.addEventListener('error', event => {
    if (!event || event.defaultPrevented) return;
    if (!isDevToolsPerformanceNoise({ message: event.message, stack: event.error?.stack, filename: event.filename })) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    ignore();
  }, true);

  window.addEventListener('unhandledrejection', event => {
    const reason = event?.reason;
    if (!isDevToolsPerformanceNoise({ message: reason?.message, stack: reason?.stack })) return;
    event.preventDefault();
    ignore();
  }, true);
}
