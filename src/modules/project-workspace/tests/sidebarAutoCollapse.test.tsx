import assert from 'node:assert/strict';

import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, test } from 'vitest';

import {
  WorkspaceLayoutProvider,
  useReportWorkspaceRightColumn,
} from '@/modules/project-workspace/context/WorkspaceLayoutContext';
import { useSidebarAutoCollapse } from '@/modules/project-workspace/hooks/useSidebarAutoCollapse';
import { isChatCrampedByPane, shouldAutoCollapseSidebar } from '@/modules/project-workspace/utils/sidebarAutoCollapse';

/**
 * On a Samsung Fold unfolded (~900px) a 420px pane next to a 300px sidebar
 * leaves the chat ~180px: the sidebar folds to its rail while the pane is open
 * and comes back, as the user left it, when the pane closes.
 */

const originalInnerWidth = window.innerWidth;

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
};

afterEach(() => {
  setViewportWidth(originalInnerWidth);
  document.body.innerHTML = '';
});

test('the chat counts as cramped only from 768px up, with a right column, under 420px', () => {
  const pane = { key: 'pane:shell', width: 420 };
  assert.equal(isChatCrampedByPane({ viewportWidth: 900, sidebarWidth: 300, rightColumn: pane }), true);
  assert.equal(isChatCrampedByPane({ viewportWidth: 900, sidebarWidth: 300, rightColumn: null }), false);
  assert.equal(isChatCrampedByPane({ viewportWidth: 1400, sidebarWidth: 300, rightColumn: pane }), false);
  assert.equal(isChatCrampedByPane({ viewportWidth: 700, sidebarWidth: 300, rightColumn: pane }), false);
  // The split session takes half of what the sidebar leaves.
  const split = { key: 'split', width: 'split' as const };
  assert.equal(isChatCrampedByPane({ viewportWidth: 1100, sidebarWidth: 300, rightColumn: split }), true);
  assert.equal(isChatCrampedByPane({ viewportWidth: 1300, sidebarWidth: 300, rightColumn: split }), false);
});

test('auto-collapse never overrides a collapsed preference or a manual expand for the same pane', () => {
  const base = { isChatCramped: true, sidebarVisible: true, rightColumnKey: 'pane:shell', manuallyExpandedForKey: null };
  assert.equal(shouldAutoCollapseSidebar(base), true);
  assert.equal(shouldAutoCollapseSidebar({ ...base, isChatCramped: false }), false);
  assert.equal(shouldAutoCollapseSidebar({ ...base, sidebarVisible: false }), false);
  assert.equal(shouldAutoCollapseSidebar({ ...base, manuallyExpandedForKey: 'pane:shell' }), false);
  assert.equal(shouldAutoCollapseSidebar({ ...base, manuallyExpandedForKey: 'editor' }), true);
});

type HarnessProps = { paneKey: string | null; sidebarVisible: boolean };
const probe: { current: ReturnType<typeof useSidebarAutoCollapse> | null } = { current: null };

function PaneReporter({ paneKey }: { paneKey: string | null }) {
  useReportWorkspaceRightColumn(paneKey, 420);
  return null;
}

function SidebarProbe({ sidebarVisible }: { sidebarVisible: boolean }) {
  const result = useSidebarAutoCollapse({ isMobile: false, sidebarVisible, sidebarWidth: 300 });
  useEffect(() => {
    probe.current = result;
  });
  return null;
}

const Harness = ({ paneKey, sidebarVisible }: HarnessProps) => (
  <WorkspaceLayoutProvider>
    <SidebarProbe sidebarVisible={sidebarVisible} />
    <PaneReporter paneKey={paneKey} />
  </WorkspaceLayoutProvider>
);

test('opening a pane folds the sidebar and closing it restores the full sidebar', () => {
  setViewportWidth(900);
  const { rerender } = render(<Harness paneKey={null} sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, false);

  rerender(<Harness paneKey="pane:shell" sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, true);

  rerender(<Harness paneKey={null} sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, false);
});

test('a manual expand holds for the open pane, and the next pane folds again', () => {
  setViewportWidth(900);
  const { rerender } = render(<Harness paneKey="pane:shell" sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, true);

  act(() => probe.current?.markManualExpand());
  assert.equal(probe.current?.isAutoCollapsed, false);

  rerender(<Harness paneKey={null} sidebarVisible />);
  rerender(<Harness paneKey="pane:shell" sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, true);
});

test('widening the screen with the pane open gives the sidebar back', () => {
  setViewportWidth(900);
  render(<Harness paneKey="pane:diff" sidebarVisible />);
  assert.equal(probe.current?.isAutoCollapsed, true);

  act(() => setViewportWidth(1600));
  assert.equal(probe.current?.isAutoCollapsed, false);
});

test('a sidebar the user collapsed is left to the stored preference', () => {
  setViewportWidth(900);
  render(<Harness paneKey="pane:shell" sidebarVisible={false} />);
  assert.equal(probe.current?.isAutoCollapsed, false);
});
