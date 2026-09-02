// Suppresses a known Chrome DevTools internal crash that shows up in the
// MyNaai console as:
//
//   Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
//     at et.reportAllChanges (<anonymous>:2:19429)
//     at <anonymous>:2:13070 ...
//
// That stack comes from Chrome's own DevTools Performance-panel helper script
// (evaluated into the page as an anonymous VM script), not from any MyNaai or
// vendor code — the identical signature and offsets are documented in
// angular/angular#70464 and it only fires while DevTools is open. We swallow
// exactly this known-broken signature so it stops masking real errors; every
// other error is reported untouched.
const KNOWN_MESSAGE = /reading 'startTime'/;
const KNOWN_FRAME = /\breportAllChanges\b/;

export function installDevToolsErrorShield() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', event => {
    if (!event || event.defaultPrevented) return;
    const message = String(event.message || '');
    const stack = String(event.error?.stack || '');
    if (KNOWN_MESSAGE.test(message) && KNOWN_FRAME.test(stack)) {
      event.preventDefault();
      console.debug('Ignored a known Chrome DevTools Performance-panel internal error (reportAllChanges). It is not caused by MyNaai.');
    }
  });
}
