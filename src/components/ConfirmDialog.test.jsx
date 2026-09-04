import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfirmProvider, LOGOUT_CONFIRM, normalizeConfirmOptions, useConfirm } from './ConfirmDialog';
import { AccountScreen } from './UserScreens';

const { userProfile } = vi.hoisted(() => ({ userProfile: vi.fn() }));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api');
  return { ...actual, api: { ...actual.api, userProfile } };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness({ options = {}, provider = true } = {}) {
  const results = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    const confirm = useConfirm();
    return (
      <button type="button" className="trigger" onClick={async () => { results.push(await confirm(options)); }}>
        Ask
      </button>
    );
  }

  const tree = provider ? <ConfirmProvider><Harness /></ConfirmProvider> : <Harness />;
  // Unmounting inside act keeps React from warning about the state updates that
  // settle a pending confirmation as the provider goes away.
  return { container, root, tree, results, unmount: async () => { await act(async () => { root.unmount(); }); } };
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const sheet = () => document.querySelector('.confirm-sheet');
const backdrop = () => document.querySelector('.confirm-backdrop');
const click = async element => { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const pressEscape = async () => {
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
};

describe('ConfirmDialog', () => {
  beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}); });
  afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; vi.restoreAllMocks(); });

  it('asks in the app instead of through the browser', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const harness = renderHarness({ options: { title: 'Cancel this booking?', message: 'Your slot will be released.', confirmLabel: 'Cancel booking', cancelLabel: 'Keep it' } });

    await act(async () => { harness.root.render(harness.tree); });
    await click(harness.container.querySelector('.trigger'));
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sheet()).not.toBeNull();
    expect(sheet().getAttribute('role')).toBe('alertdialog');
    expect(sheet().getAttribute('aria-modal')).toBe('true');
    expect(sheet().textContent).toContain('Cancel this booking?');
    expect(sheet().textContent).toContain('Your slot will be released.');
    expect(document.querySelector('.confirm-ok').textContent).toBe('Cancel booking');
    expect(document.querySelector('.confirm-cancel').textContent).toBe('Keep it');
    // The page behind the sheet must not scroll while a decision is pending.
    expect(document.body.classList.contains('modal-open')).toBe(true);

    await harness.unmount();
  });

  it('resolves true for the confirm button and false for cancel, escape and the backdrop', async () => {
    const harness = renderHarness({ options: { title: 'Delete this service?' } });
    await act(async () => { harness.root.render(harness.tree); });
    const trigger = harness.container.querySelector('.trigger');

    await click(trigger);
    await flush();
    await click(document.querySelector('.confirm-ok'));
    await flush();
    expect(harness.results).toEqual([true]);
    expect(sheet()).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);

    await click(trigger);
    await flush();
    await click(document.querySelector('.confirm-cancel'));
    await flush();

    await click(trigger);
    await flush();
    await pressEscape();
    await flush();

    await click(trigger);
    await flush();
    await click(backdrop());
    await flush();

    expect(harness.results).toEqual([true, false, false, false]);
    await harness.unmount();
  });

  it('focuses the safe action on a destructive prompt and gives focus back afterwards', async () => {
    const harness = renderHarness({ options: { title: 'Log out of My Naai?', tone: 'danger' } });
    await act(async () => { harness.root.render(harness.tree); });
    const trigger = harness.container.querySelector('.trigger');
    // A synthetic click does not move focus the way a real tap/keystroke does,
    // so set the starting point explicitly before the sheet steals it.
    trigger.focus();

    await click(trigger);
    await flush();
    // A destructive sheet must not run on an impatient Enter.
    expect(document.activeElement).toBe(document.querySelector('.confirm-cancel'));
    expect(sheet().className).toContain('confirm-danger');

    await click(document.querySelector('.confirm-cancel'));
    await flush();
    expect(document.activeElement).toBe(trigger);
    await harness.unmount();
  });

  it('answers a second confirmation queued behind the first', async () => {
    const harness = renderHarness({ options: { title: 'First?' } });
    await act(async () => { harness.root.render(harness.tree); });
    const trigger = harness.container.querySelector('.trigger');

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flush();
    expect(sheet().textContent).toContain('First?');

    await click(document.querySelector('.confirm-ok'));
    await flush();
    expect(sheet().textContent).toContain('First?');

    await click(document.querySelector('.confirm-cancel'));
    await flush();
    expect(harness.results).toEqual([true, false]);
    expect(sheet()).toBeNull();
    await harness.unmount();
  });

  it('cancels rather than silently allowing an action when no provider is mounted', async () => {
    const harness = renderHarness({ provider: false });
    await act(async () => { harness.root.render(harness.tree); });
    await click(harness.container.querySelector('.trigger'));
    await flush();
    expect(harness.results).toEqual([false]);
    expect(sheet()).toBeNull();
    await harness.unmount();
  });

  it('releases pending confirmations when the provider unmounts', async () => {
    const harness = renderHarness({ options: { title: 'Pending?' } });
    await act(async () => { harness.root.render(harness.tree); });
    await click(harness.container.querySelector('.trigger'));
    await flush();
    expect(sheet()).not.toBeNull();

    await act(async () => { harness.root.unmount(); });
    await flush();
    expect(harness.results).toEqual([false]);
  });

  it('keeps the shared logout copy pointed at the safe answer', () => {
    expect(LOGOUT_CONFIRM.tone).toBe('danger');
    expect(normalizeConfirmOptions(LOGOUT_CONFIRM).defaultAction).toBe('cancel');
  });

  it('fills in sane defaults and lets a caller hide the tone icon', () => {
    expect(normalizeConfirmOptions('Delete this?')).toMatchObject({
      title: 'Delete this?',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      tone: 'neutral',
      defaultAction: 'confirm',
    });
    expect(normalizeConfirmOptions({ tone: 'danger' }).icon).not.toBeNull();
    expect(normalizeConfirmOptions({ tone: 'danger', icon: null }).icon).toBeNull();
    expect(normalizeConfirmOptions({ tone: 'nonsense' }).tone).toBe('neutral');
  });
});

// End-to-end: a real screen's destructive action must run through the sheet.
describe('confirmation wiring in the customer account screen', () => {
  beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}); userProfile.mockReset(); userProfile.mockResolvedValue({ status: 'SUCCESS', data: { fullName: 'Ravi', phoneNumber: '9876543210' } }); });
  afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; vi.restoreAllMocks(); });

  it('logs out only after the partner confirms in the app dialog', async () => {
    const onLogout = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ConfirmProvider>
          <AccountScreen
            session={{ userId: 'user-1', user: { fullName: 'Ravi', phoneNumber: '9876543210' } }}
            navigate={() => {}}
            notify={() => {}}
            onLogout={onLogout}
            onSessionUpdate={() => {}}
          />
        </ConfirmProvider>,
      );
    });
    await flush();

    await click(container.querySelector('.logout-button'));
    await flush();
    await flush();

    expect(sheet()).not.toBeNull();
    expect(sheet().textContent).toContain(LOGOUT_CONFIRM.title);
    expect(document.querySelector('.confirm-ok').textContent).toBe('Log out');
    expect(document.querySelector('.confirm-cancel').textContent).toBe('Stay signed in');
    // Still signed in until the sheet is answered.
    expect(onLogout).not.toHaveBeenCalled();

    await click(document.querySelector('.confirm-ok'));
    await flush();
    await flush();

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(sheet()).toBeNull();
    await act(async () => { root.unmount(); });
  });

  it('keeps the session when the sheet is dismissed', async () => {
    const onLogout = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ConfirmProvider>
          <AccountScreen session={{ userId: 'user-1', user: {} }} navigate={() => {}} notify={() => {}} onLogout={onLogout} onSessionUpdate={() => {}} />
        </ConfirmProvider>,
      );
    });
    await flush();

    await click(container.querySelector('.logout-button'));
    await flush();
    await pressEscape();
    await flush();

    expect(onLogout).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();
    await act(async () => { root.unmount(); });
  });
});

// Guards the whole point of the sheet: nothing in the app may fall back to a
// blocking browser dialog, which an installed PWA cannot style and may suppress.
describe('no native browser dialogs in app code', () => {
  const walk = dir => readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  const stripComments = code => code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('never calls window.confirm / window.alert / window.prompt', () => {
    const nativeDialog = /(?:window|globalThis|self|global)\s*\.\s*(?:confirm|alert|prompt)\s*\(/;
    const offenders = walk(join(process.cwd(), 'src'))
      .filter(file => /\.(js|jsx)$/.test(file) && !/\.test\.(js|jsx)$/.test(file))
      .filter(file => nativeDialog.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
