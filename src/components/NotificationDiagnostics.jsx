import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, ChevronDown, CircleAlert, Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { formatPushDiagnostics, getPushDiagnostics, getPushToken } from '../lib/push';
import { Button, cx } from './Shared';

// "Notifications are not working" can come from five different layers — HTTPS,
// the Firebase build config, the browser permission, the messaging service
// worker and the FCM token — spread across the browser, the deployment and the
// backend. This card names the failing layer on the device the person is
// actually holding, and copies a plain-text report for support.
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

  const failing = (diagnostics?.checks || []).filter(check => check.state === 'fail');
  // Once the browser has granted permission there is nothing left to ask for,
  // so the action only appears while it can still change something.
  const canRequestPermission = typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted';
  const summary = !diagnostics
    ? 'Check permission, service worker and token on this device'
    : failing.length
      ? `${failing.length} check${failing.length === 1 ? '' : 's'} need attention`
      : 'All checks passed on this device';

  const copyReport = async () => {
    const text = `MyNaai web push report · ${new Date().toLocaleString('en-IN')}\n${formatPushDiagnostics(diagnostics)}`;
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

  return (
    <section className={cx('account-card', 'notification-diagnostics', open && 'open')}>
      <button type="button" className="diagnostics-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="notification-diagnostics-body">
        <span className="account-menu-icon"><Bell size={18} /></span>
        <span className="diagnostics-heading">
          <strong>Notification status</strong>
          <small>{summary}</small>
        </span>
        {diagnostics && (failing.length ? <CircleAlert size={17} className="diagnostics-mark fail" /> : <CheckCircle2 size={17} className="diagnostics-mark ok" />)}
        <ChevronDown size={17} className="collapsible-chevron" />
      </button>
      {open && <div className="diagnostics-body" id="notification-diagnostics-body">
        {busy && !diagnostics ? <p className="diagnostics-note">Running the checks…</p> : (diagnostics?.checks || []).map(check => (
          <div className={cx('diagnostics-row', `row-${check.state}`)} key={check.label}>
            <span className="diagnostics-row-mark">{check.state === 'ok' ? <CheckCircle2 size={15} /> : check.state === 'warn' ? <TriangleAlert size={15} /> : <CircleAlert size={15} />}</span>
            <span className="diagnostics-row-copy"><strong>{check.label}</strong><small>{check.value}{check.detail ? ` — ${check.detail}` : ''}</small></span>
          </div>
        ))}
        <p className="diagnostics-note">Foreground messages are shown by the portal itself; background messages are displayed by <code>firebase-messaging-sw.js</code>. If the token is present but nothing arrives, the message is not reaching this browser token on the server side.</p>
        <div className="diagnostics-actions">
          <Button size="small" variant="secondary" onClick={run} loading={busy}><RefreshCw size={14} /> Run again</Button>
          {canRequestPermission && <Button size="small" variant="secondary" onClick={enable} loading={busy}>Allow notifications</Button>}
          {diagnostics && <Button size="small" variant="secondary" onClick={copyReport}><Copy size={14} /> {copied ? 'Copied' : 'Copy report'}</Button>}
        </div>
      </div>}
    </section>
  );
}
