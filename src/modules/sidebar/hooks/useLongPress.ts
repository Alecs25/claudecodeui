import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

const LONG_PRESS_MS = 450;
// A finger that drifts this far is scrolling the list, not pressing the row.
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press and right-click on a sidebar row, both opening its actions.
 *
 * Touch only for the long press: a mouse already has the right-click. The
 * click the browser fires when the finger lifts after a long press is
 * swallowed, or the row would also open the session under the menu. Android
 * reports the same long press as a `contextmenu` too; whichever comes first
 * opens the menu and the other is ignored.
 */
export function useLongPress(onOpen: (source: 'touch' | 'pointer') => void, enabled = true) {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const lastPointerTypeRef = useRef<string>('mouse');

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    lastPointerTypeRef.current = event.pointerType;
    firedRef.current = false;
    if (!enabled || event.pointerType !== 'touch') {
      return;
    }
    originRef.current = { x: event.clientX, y: event.clientY };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      onOpen('touch');
    }, LONG_PRESS_MS);
  }, [clearTimer, enabled, onOpen]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const origin = originRef.current;
    if (!origin || timerRef.current === null) {
      return;
    }
    if (Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX || Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX) {
      clearTimer();
    }
  }, [clearTimer]);

  const onPointerEnd = useCallback(() => {
    originRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }
    event.preventDefault();
    clearTimer();
    if (firedRef.current) {
      return;
    }
    firedRef.current = lastPointerTypeRef.current === 'touch';
    onOpen(lastPointerTypeRef.current === 'touch' ? 'touch' : 'pointer');
  }, [clearTimer, enabled, onOpen]);

  /** Returns true when the click is the tail of a long press and was swallowed. */
  const consumeClickAfterLongPress = useCallback((event: MouseEvent<HTMLElement>): boolean => {
    if (!firedRef.current) {
      return false;
    }
    firedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onContextMenu,
    },
    consumeClickAfterLongPress,
  };
}
