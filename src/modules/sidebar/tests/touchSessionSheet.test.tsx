import assert from 'node:assert/strict';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { TFunction } from 'i18next';
import { afterEach, test, vi } from 'vitest';

import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';
import type { LLMProvider, SessionWithProvider } from '@/shared/types';

/**
 * On touch a session row has no visible buttons: a long press opens a bottom
 * sheet with the same actions as the "…" menu. These tests open it the two
 * ways a finger can (the press timer, and Android's `contextmenu`) and check
 * it follows the same capability and running-session rules as the menu.
 */

// Exercise the real shared capability hook: the sheet must follow the server
// matrix and withhold actions for missing or unsupported providers.
vi.mock('@/shared/api', () => ({
  api: {
    providerSessionId: async () => ({
      ok: true,
      json: async () => ({ data: { sessionId: 'native-session-1' } }),
    }),
    providers: {
      capabilities: async () => ({
        json: async () => ({
          success: true,
          data: {
            providers: [
              { provider: 'claude', supportsSessionForking: true },
              { provider: 'codex', supportsSessionForking: true },
              { provider: 'cursor', supportsSessionForking: false },
            ],
          },
        }),
      }),
    },
  },
}));

// jsdom has no PointerEvent, so fireEvent.pointerDown would lose `pointerType`.
if (typeof window.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

const SESSION: SessionWithProvider = {
  id: 'session-1',
  summary: 'Session one',
  __provider: 'claude',
  __projectId: 'project-1',
};
const t = ((key: string) => key) as TFunction;
const noop = () => {};

const rowProps = (
  overrides: Partial<ComponentProps<typeof SidebarSessionItem>> = {},
): ComponentProps<typeof SidebarSessionItem> => ({
  projectId: 'project-1',
  session: SESSION,
  selectedSession: null,
  isProcessing: false,
  hasBackgroundWork: false,
  needsAttention: false,
  isWaiting: false,
  currentTime: new Date('2026-10-17T00:00:00.000Z'),
  isEditing: false,
  renameDraft: '',
  onRenameDraftChange: noop,
  onStartEditingSession: noop,
  onCancelEditingSession: noop,
  onSaveEditingSession: noop,
  onSessionSelect: noop,
  onDeleteSession: noop,
  onArchiveSession: noop,
  onSetSessionStatus: noop,
  onForkSession: noop,
  t,
  ...overrides,
});

const row = () => screen.getByTestId('session-row');

// Android reports a long press as a touch pointerdown followed by `contextmenu`.
const openSheet = async () => {
  await act(async () => {
    fireEvent.pointerDown(row(), { pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.contextMenu(row());
  });
  return within(screen.getByRole('dialog'));
};

afterEach(() => {
  vi.useRealTimers();
});

test.each<LLMProvider>(['claude', 'codex'])('the sheet offers a fork for a supported %s session', async (provider) => {
  render(<SidebarSessionItem {...rowProps({ session: { ...SESSION, __provider: provider } })} />);
  const sheet = await openSheet();

  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.fork' }));
  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.rename' }));
  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.archive' }));
  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.delete' }));
});

test('holding a finger on the row opens the sheet and the lifting tap does not open the session', async () => {
  vi.useFakeTimers();
  const onSessionSelect = vi.fn();
  render(<SidebarSessionItem {...rowProps({ onSessionSelect })} />);

  fireEvent.pointerDown(row(), { pointerType: 'touch', clientX: 10, clientY: 10 });
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  assert.ok(screen.getByRole('dialog'));

  fireEvent.pointerUp(row(), { pointerType: 'touch' });
  fireEvent.click(row());
  assert.equal(onSessionSelect.mock.calls.length, 0);
});

test('a finger that moves is scrolling, not pressing', async () => {
  vi.useFakeTimers();
  render(<SidebarSessionItem {...rowProps()} />);

  fireEvent.pointerDown(row(), { pointerType: 'touch', clientX: 10, clientY: 10 });
  fireEvent.pointerMove(row(), { pointerType: 'touch', clientX: 10, clientY: 40 });
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  assert.equal(screen.queryByRole('dialog'), null);
});

test('forking from the sheet passes the owning session once and dismisses the sheet', async () => {
  const onForkSession = vi.fn();
  const onSessionSelect = vi.fn();
  render(<SidebarSessionItem {...rowProps({ onForkSession, onSessionSelect })} />);
  const sheet = await openSheet();

  fireEvent.click(sheet.getByRole('button', { name: 'sessionMenu.fork' }));

  assert.deepEqual(onForkSession.mock.calls, [[SESSION]]);
  assert.equal(onSessionSelect.mock.calls.length, 0);
  assert.equal(screen.queryByRole('dialog'), null);
});

test('archiving from the sheet archives straight away', async () => {
  const onArchiveSession = vi.fn();
  const onDeleteSession = vi.fn();
  render(<SidebarSessionItem {...rowProps({ onArchiveSession, onDeleteSession })} />);
  const sheet = await openSheet();

  fireEvent.click(sheet.getByRole('button', { name: 'sessionMenu.archive' }));

  assert.deepEqual(onArchiveSession.mock.calls, [['session-1']]);
  assert.equal(onDeleteSession.mock.calls.length, 0);
});

test.each<LLMProvider>(['cursor', 'opencode'])('the sheet withholds a fork when %s is unsupported or absent from the matrix', async (provider) => {
  render(<SidebarSessionItem {...rowProps({ session: { ...SESSION, __provider: provider } })} />);
  const sheet = await openSheet();

  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.fork' }), null);
});

test('the sheet withholds a fork when its caller provides no fork handler', async () => {
  render(<SidebarSessionItem {...rowProps({ onForkSession: undefined })} />);
  const sheet = await openSheet();

  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.fork' }), null);
});

test('a running session offers no fork, archive or delete, including when it starts with the sheet open', async () => {
  const props = rowProps({ isProcessing: true });
  const { rerender } = render(<SidebarSessionItem {...props} />);
  const sheet = await openSheet();
  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.fork' }), null);
  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.archive' }), null);
  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.delete' }), null);

  rerender(<SidebarSessionItem {...props} isProcessing={false} />);
  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.fork' }));

  rerender(<SidebarSessionItem {...props} />);
  assert.equal(sheet.queryByRole('button', { name: 'sessionMenu.fork' }), null);
});

test('background work alone keeps the fork available, matching the menu rule', async () => {
  render(<SidebarSessionItem {...rowProps({ hasBackgroundWork: true })} />);
  const sheet = await openSheet();

  assert.ok(sheet.getByRole('button', { name: 'sessionMenu.fork' }));
});

test('bulk selection withholds the options and the long press', async () => {
  render(<SidebarSessionItem {...rowProps({ isSelecting: true })} />);

  assert.equal(screen.queryByRole('button', { name: 'sessionMenu.options: Session one' }), null);
  await act(async () => {
    fireEvent.pointerDown(row(), { pointerType: 'touch' });
    fireEvent.contextMenu(row());
  });
  assert.equal(screen.queryByRole('dialog'), null);
});
