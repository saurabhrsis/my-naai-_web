import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, ChevronDown, CircleAlert, Copy, RefreshCw } from 'lucide-react';
import { formatPushDiagnostics, getPushDiagnostics, getPushToken } from '../lib/push';
import { Button, cx } from './Shared';

// "Notifications are not working" can come from several layers — browser
// permission, Firebase config, the messaging worker or the FCM token. Users
// never need to see those internals: this card only says notifications are
// required, and gives them one plain way to hand the team the facts when
// something does not arrive ("Copy report"). The full detail stays inside the
// copied report, never on screen.
export function NotificationDiagnostics({ onEnabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setDiagnostics(await getPushDiagnostics());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (open && !diagnostics && !busy) run(); }, [busy, diagnostics, open, run]);

  const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  const failing = (diagnostics?.checks || []).filter(check => check.state === 'fail');
  const working = permission === 'granted' && failing.length === 0;
  const canRequestPermission = permission === 'default';

  const summary = !diagnostics
    ? 'Required for booking buzzers and updates'
    : working
      ? 'Allowed in this browser'
      : permission === 'denied'
        ? 'Blocked in this browser'
        : permission === 'unsupported'
          ? 'Not supported in this browser'
          : failing.length
            ? 'Allowed, but something needs a fix'
            : 'Required — allow notifications for alerts';

  const copyReport = async () => {
    const text = `My Naai web push report · ${new Date().toLocaleString('en-IN')}\n${formatPushDiagnostics(diagnostics)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (clipboardError) {
      window.prompt('Copy this report for support:', text);
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      await getPushToken({ requestPermission: true });
      await run();
      onEnabled?.();
    } finally {
      setBusy(false);
    }
  };

  const note = permission === 'denied'
    ? 'Notifications are blocked in this browser. Open the site’s permission settings and set Notifications to Allow, so booking buzzers, delay requests and appointment updates can reach you.'
    : permission === 'unsupported'
      ? 'This browser cannot show notifications. Use Chrome, Edge or Samsung Internet — or install the My Naai app on iPhone/iPad.'
      : permission === 'default'
        ? 'Notifications are required to receive booking buzzers, delay requests and appointment updates.'
        : failing.length
          ? 'Notifications are allowed in this browser, but something is stopping them on this device.'
          : 'Notifications are allowed in this browser, so booking buzzers, delay requests and appointment updates can reach you.';

  return (
    <section className={cx('account-card', 'notification-diagnostics', open && 'open')}>
      <button type="button" className="diagnostics-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="notification-diagnostics-body">
        <span className="account-menu-icon"><Bell size={18} /></span>
        <span className="diagnostics-heading">
          <strong>Notifications</strong>
          <small>{summary}</small>
        </span>
        {diagnostics && (working
          ? <CheckCircle2 size={17} className="diagnostics-mark ok" />
          : permission === 'denied' || permission === 'unsupported' || failing.length
            ? <CircleAlert size={17} className="diagnostics-mark fail" />
            : <CircleAlert size={17} className="diagnostics-mark warn" />)}
        <ChevronDown size={17} className="collapsible-chevron" />
      </button>
      {open && <div className="diagnostics-body" id="notification-diagnostics-body">
        {!diagnostics
          ? <p className="diagnostics-note">{busy ? 'Checking this browser…' : 'Notifications are required to receive booking buzzers, delay requests and appointment updates.'}</p>
          : <>
            <p className="diagnostics-note">{note}</p>
            <p className="diagnostics-note">Missing a notification? Copy the report and share it with My Naai support — we can check it from there.</p>
          </>}
        <div className="diagnostics-actions">
          <Button size="small" variant="secondary" onClick={run} loading={busy}><RefreshCw size={14} /> Check again</Button>
          {canRequestPermission && <Button size="small" variant="secondary" onClick={enable} loading={busy}>Allow notifications</Button>}
          {diagnostics && <Button size="small" variant="secondary" onClick={copyReport}><Copy size={14} /> {copied ? 'Copied' : 'Copy report'}</Button>}
        </div>
      </div>}
    </section>
  );
}
