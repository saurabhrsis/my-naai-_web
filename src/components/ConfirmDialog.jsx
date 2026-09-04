import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, LogOut, TriangleAlert } from 'lucide-react';
import { cx } from './Shared';

// Every destructive or irreversible action in the portal (logout, cancel a
// booking, delete a service/product/specialist, replace the service list, mark a
// service done) is confirmed through this dialog instead of `window.confirm`.
//
// Why not the browser dialog:
//  - It is blocking, unstyled and cannot be themed, so it breaks the app's look.
//  - In an installed PWA on iPhone (Safari *and* Chrome both use WKWebView) the
//    sheet is drawn by the OS with a "website.com says" prefix, and on some
//    Android PWA/Custom-Tab configurations it is suppressed entirely — a
//    `window.confirm` that silently returns false makes buttons look dead.
//  - It cannot respect the device safe areas, so on a notched phone the buttons
//    land under the status bar or the home indicator.
//
// Usage:
//   const confirm = useConfirm();
//   if (!(await confirm({ title: 'Cancel this booking?', tone: 'danger' }))) return;
//
// `confirm()` always resolves a boolean, never throws, and resolves `false`
// when the dialog is dismissed (Escape, backdrop tap, or the Cancel button).
const ConfirmContext = createContext(null);

const TONE_ICONS = {
  danger: TriangleAlert,
  warning: CircleAlert,
  info: CircleAlert,
  neutral: CircleAlert,
};

// Shared copy for the logout confirmation used by the customer account screen,
// the partner account screen, the desktop sidebar and the expired-plan notice.
export const LOGOUT_CONFIRM = {
  title: 'Log out of My Naai?',
  message: 'You will need your mobile number and a fresh OTP to sign back in on this device.',
  confirmLabel: 'Log out',
  cancelLabel: 'Stay signed in',
  tone: 'danger',
  icon: LogOut,
  defaultAction: 'cancel',
};

// Accepts either a string (used as the title) or an options object, and fills
// in the defaults every call site would otherwise repeat.
export function normalizeConfirmOptions(input = {}) {
  const options = typeof input === 'string' ? { title: input } : { ...input };
  const tone = ['danger', 'warning', 'info', 'neutral'].includes(options.tone) ? options.tone : 'neutral';
  return {
    title: options.title || 'Are you sure?',
    message: options.message || '',
    confirmLabel: options.confirmLabel || 'Confirm',
    cancelLabel: options.cancelLabel || 'Cancel',
    tone,
    // An explicit `icon: null` hides the badge; otherwise the tone picks one.
    icon: 'icon' in options ? options.icon || null : TONE_ICONS[tone],
    // Destructive dialogs focus Cancel so an impatient Enter cannot delete data.
    defaultAction: options.defaultAction || (tone === 'danger' ? 'cancel' : 'confirm'),
    closeOnBackdrop: options.closeOnBackdrop !== false,
  };
}

export function ConfirmProvider({ children }) {
  // A queue (not a single slot) so two confirmations triggered in the same tick
  // — e.g. a swipe action that also confirms — both get answered instead of the
  // second promise hanging forever.
  const queueRef = useRef([]);
  const nextIdRef = useRef(1);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion(value => value + 1), []);

  const request = useCallback(options => new Promise(resolve => {
    nextIdRef.current += 1;
    queueRef.current = [...queueRef.current, { id: nextIdRef.current, options: normalizeConfirmOptions(options), resolve }];
    rerender();
  }), [rerender]);

  const settle = useCallback(value => {
    const [current, ...rest] = queueRef.current;
    queueRef.current = rest;
    rerender();
    // Resolved after the state swap so the dialog is already gone when the
    // caller's `await` continues (no flash of a stale dialog behind a mutation).
    current?.resolve(Boolean(value));
  }, [rerender]);

  // Never leave a caller awaiting a dialog that will not render.
  useEffect(() => () => {
    const pending = queueRef.current;
    queueRef.current = [];
    pending.forEach(item => item.resolve(false));
  }, []);

  const current = queueRef.current[0];
  return (
    <ConfirmContext.Provider value={request}>
      {children}
      {current && <ConfirmDialog key={current.id} options={current.options} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const request = useContext(ConfirmContext);
  return useCallback(options => {
    if (request) return request(options);
    // Outside the provider (a unit test that renders a screen on its own) the
    // safe answer is "no": a destructive action never runs unconfirmed.
    console.debug('useConfirm() was called outside <ConfirmProvider>; answering "cancel".');
    return Promise.resolve(false);
  }, [request]);
}

function ConfirmDialog({ options, onSettle }) {
  const sheetRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const messageId = useId();
  const { title, message, confirmLabel, cancelLabel, tone, icon: Icon, defaultAction, closeOnBackdrop } = options;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    document.body.classList.add('modal-open');
    const backdrop = sheetRef.current?.parentElement;
    // iOS ignores `overflow: hidden` on <body>, so the backdrop also swallows
    // touch moves that start outside the sheet: the page behind a confirmation
    // must not scroll while the partner is deciding.
    const onTouchMove = event => {
      if (sheetRef.current?.contains(event.target)) return;
      event.preventDefault();
    };
    backdrop?.addEventListener('touchmove', onTouchMove, { passive: false });
    // Capture phase + stopPropagation keeps Escape from also closing a <Modal>
    // that happens to be open underneath this dialog (both listen on document).
    const onKeyDown = event => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      event.preventDefault();
      event.stopPropagation();
      onSettle(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    const initial = defaultAction === 'confirm' ? confirmRef.current : cancelRef.current;
    (initial || confirmRef.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop?.removeEventListener('touchmove', onTouchMove);
      // A <Modal> can still be open underneath this sheet; only unlock the page
      // when nothing else is holding the scroll lock.
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [defaultAction, onSettle]);

  const onSheetKeyDown = event => {
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const focusable = Array.from(sheetRef.current.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !sheetRef.current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !sheetRef.current.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onBackdropClick = event => {
    if (!closeOnBackdrop || event.target !== event.currentTarget) return;
    onSettle(false);
  };

  return (
    <div className="confirm-backdrop" onClick={onBackdropClick}>
      <section
        ref={sheetRef}
        className={cx('confirm-sheet', `confirm-${tone}`)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={onSheetKeyDown}
      >
        <span className="confirm-grip" aria-hidden="true" />
        {Icon && <span className="confirm-icon" aria-hidden="true"><Icon size={22} /></span>}
        <h2 id={titleId}>{title}</h2>
        {message && <p id={messageId}>{message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="confirm-btn confirm-cancel" onClick={() => onSettle(false)}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className="confirm-btn confirm-ok" onClick={() => onSettle(true)}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialog;
