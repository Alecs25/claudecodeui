import { memo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ActivityIcon, Loader2Icon } from 'lucide-react';

import { cn } from '@/shared/utils';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSeparator,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';
import { PlanUsageBadge, PlanUsageSection } from '@/modules/plan-usage';

type TokenUsageSummaryProps = {
  usage: Record<string, unknown> | null;
  /** Opens the detailed token breakdown — what tapping the old counter did. */
  onClick?: () => void;
  /**
   * Starts a compaction of the session, with optional instructions (the
   * `/compact <instructions>` of Claude Code). Absent when compaction cannot
   * be offered, e.g. a chat that has not started yet.
   */
  onCompact?: (instructions: string) => void;
  /** False while a turn runs: a compaction is a turn of its own. */
  canCompact?: boolean;
  /** True from the click until that compaction turn ends. */
  isCompacting?: boolean;
};

const formatTokenCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }

  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}K`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toLocaleString();
};

const readUsageNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Used and window sizes from a token budget, and the share of the window in
 * use (0–1), or null when the window is unknown.
 */
function readContextUsage(usage: Record<string, unknown> | null) {
  const breakdown =
    usage?.breakdown && typeof usage.breakdown === 'object'
      ? usage.breakdown as Record<string, unknown>
      : null;
  const inputTokens = readUsageNumber(usage?.inputTokens ?? breakdown?.input);
  const outputTokens = readUsageNumber(usage?.outputTokens ?? breakdown?.output);
  const usedTokens = readUsageNumber(usage?.used) || inputTokens + outputTokens;
  const totalTokens = readUsageNumber(usage?.total);
  const ratio = totalTokens > 0 ? Math.min(1, usedTokens / totalTokens) : null;
  return { usedTokens, totalTokens, ratio };
}

const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Warns as the window fills: amber from 70%, red from 90%. */
function ringColorClass(ratio: number) {
  if (ratio >= 0.9) return 'text-red-500';
  if (ratio >= 0.7) return 'text-amber-500';
  return 'text-primary';
}

function ContextRing({ ratio }: { ratio: number }) {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={RING_RADIUS} fill="none" strokeWidth="2.5" className="stroke-muted-foreground/20" />
      <circle
        cx="9"
        cy="9"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
        className={ringColorClass(ratio)}
        data-testid="context-ring-fill"
      />
    </svg>
  );
}

/**
 * Rendered by chat's ChatComposer next to the model picker: a ring showing how
 * full the context window is. Tapping it opens a popover with the numbers, the
 * detailed token breakdown and a Compact action — a popover rather than a
 * hover tooltip so it works the same on a phone.
 */
function TokenUsageSummary({ usage, onClick, onCompact, canCompact = false, isCompacting = false }: TokenUsageSummaryProps) {
  const { t } = useTranslation();
  const { usedTokens, totalTokens, ratio } = readContextUsage(usage);
  // Whether the popover is showing; it portals out of the composer.
  const [isOpen, setIsOpen] = useState(false);
  // Optional `/compact` instructions typed in the popover, kept across
  // reopening so a half-written note is not lost.
  const [instructions, setInstructions] = useState('');
  const close = useCallback(() => setIsOpen(false), []);
  // Portalled like the model menu: the composer's stacking context would clip it.
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close);

  const percent = ratio === null ? null : Math.round(ratio * 100);
  const summary = totalTokens > 0
    ? t('chat:contextUsage.summary', {
        used: formatTokenCount(usedTokens),
        total: formatTokenCount(totalTokens),
        percent,
        defaultValue: '{{used}} / {{total}} ({{percent}}%)',
      })
    : t('chat:misc.tokensUsed', { count: usedTokens });
  const ariaLabel = t('chat:contextUsage.label', { defaultValue: 'Context usage' });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={summary}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          isOpen && 'text-foreground',
        )}
      >
        {isCompacting ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : ratio === null ? (
          <ActivityIcon className="h-4 w-4" />
        ) : (
          <ContextRing ratio={ratio} />
        )}
        <span className="font-medium tabular-nums cq-compact:hidden">
          {percent === null ? formatTokenCount(usedTokens) : `${percent}%`}
        </span>
        <PlanUsageBadge className="cq-compact:hidden" />
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={ariaLabel}>
          <ComposerMenuHeading>{ariaLabel}</ComposerMenuHeading>
          <p className="px-2.5 pb-1.5 text-sm font-medium tabular-nums text-foreground">{summary}</p>
          {onClick && (
            <ComposerMenuItem
              role="menuitem"
              label={t('chat:contextUsage.details', { defaultValue: 'Token details' })}
              isSelected={false}
              onSelect={() => {
                setIsOpen(false);
                onClick();
              }}
            />
          )}

          <ComposerMenuSeparator />
          <PlanUsageSection className="min-w-56 px-2.5 pb-1.5" />

          {onCompact && (
            <>
              <ComposerMenuSeparator />
              <div className="px-2.5 pb-1.5">
                <label className="block text-[11px] font-medium text-muted-foreground" htmlFor="compact-instructions">
                  {t('chat:contextUsage.instructions', { defaultValue: 'Instructions (optional)' })}
                </label>
                <input
                  id="compact-instructions"
                  type="text"
                  value={instructions}
                  disabled={!canCompact}
                  onChange={(event) => setInstructions(event.target.value)}
                  className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={!canCompact || isCompacting}
                  onClick={() => {
                    onCompact(instructions.trim());
                    setInstructions('');
                    setIsOpen(false);
                  }}
                  className="mt-2 w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCompacting
                    ? t('chat:contextUsage.compacting', { defaultValue: 'Compacting…' })
                    : t('chat:contextUsage.compact', { defaultValue: 'Compact' })}
                </button>
              </div>
            </>
          )}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/** Memoized: the composer re-renders on every keystroke and this row's numbers only move when a turn ends. */
export default memo(TokenUsageSummary);
