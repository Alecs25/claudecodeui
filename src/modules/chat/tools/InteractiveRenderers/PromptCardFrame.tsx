import React, { forwardRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

type PromptCardFrameProps = {
  /** What the card asks, for screen readers. */
  label: string;
  icon: ReactNode;
  /** The short tag beside the icon: the question's header, or "Plan". */
  chip?: string;
  /** Right-aligned note: "1 of 2", "multiple choice". */
  progress?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
  actions: ReactNode;
};

/**
 * The frame shared by the question and plan cards that take the composer's
 * place while Claude waits for an answer: an orange border so the wait reads
 * as "your turn" rather than as one more tool row.
 */
export const PromptCardFrame = forwardRef<HTMLDivElement, PromptCardFrameProps>(function PromptCardFrame(
  { label, icon, chip, progress, onKeyDown, children, actions },
  ref,
) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="prompt-card"
      className="w-full rounded-2xl border-2 border-orange-500 bg-card p-3 text-foreground shadow-[0_6px_24px_rgba(201,100,66,0.15)] outline-none cq-compact:rounded-xl cq-compact:p-2.5 dark:border-orange-400"
    >
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className="flex-shrink-0 text-orange-600 dark:text-orange-400">{icon}</span>
        {chip && (
          <span className="min-w-0 truncate rounded-full bg-orange-100 px-2 py-0.5 text-[11.5px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            {chip}
          </span>
        )}
        {progress && (
          <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground" data-testid="prompt-card-progress">
            {progress}
          </span>
        )}
      </div>
      {children}
      <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
});

type PromptCardButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

/** A card action: 36px tall, the primary one orange and pushed to the right. */
export function PromptCardButton({ variant = 'secondary', className = '', ...props }: PromptCardButtonProps) {
  const look = variant === 'primary'
    ? 'ml-auto border-orange-600 bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 dark:border-orange-500 dark:bg-orange-500 dark:hover:bg-orange-600'
    : 'border-border bg-card text-foreground hover:bg-muted';
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed ${look} ${className}`}
    />
  );
}
