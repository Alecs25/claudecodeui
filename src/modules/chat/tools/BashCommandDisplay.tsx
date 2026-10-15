import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Copy, Check } from 'lucide-react';

import { cn,copyTextToClipboard } from '@/shared/utils';
import { ToolStatusBadge } from '@/modules/chat/tools/ToolStatusBadge';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import type { ToolStatus } from '@/shared/types';

type BashCommandDisplayProps = {
  command: string;
  description?: string;
  /** Combined stdout/stderr from the tool result (empty while running). */
  output?: string;
  isError?: boolean;
  status?: ToolStatus;
  defaultOpen?: boolean;
};

/**
 * Codex-in-VSCode style command row: a compact, single-line command with a
 * chevron on the left. When the command produced output, the row becomes a
 * dropdown that expands to reveal the output inline. Theme-integrated surfaces
 * keep it clean in both light and dark mode; consecutive commands stack tightly
 * into a clean list.
 *
 * Rendered by chat's ToolRenderer for shell tools (Bash and friends).
 */
export const BashCommandDisplay: React.FC<BashCommandDisplayProps> = ({
  command,
  description,
  output,
  isError = false,
  status,
  defaultOpen = false,
}) => {
  const { t } = useTranslation();
  const trimmedOutput = (output || '').replace(/\s+$/, '');
  const trimmedDescription = (description || '').trim();
  // With a description the row reads like Claude's apps ("Find the process on
  // port 3001") and the command moves into the expanded body, so the row can
  // open even before the command has produced any output.
  const hasDescription = trimmedDescription.length > 0;
  const hasOutput = trimmedOutput.length > 0;
  const isExpandable = hasOutput || hasDescription;
  const outputLineCount = hasOutput ? trimmedOutput.split('\n').length : 0;
  const isRunning = status === 'running';
  // `open` is raised by an effect once output arrives (below). A document is
  // rendered without effects, so it would show every command and no output.
  const isExporting = useIsExportingTranscript();
  const [openState, setOpen] = useState(false);
  const open = openState || isExporting;
  const [copied, setCopied] = useState(false);

  // Output often arrives after this component first mounts, so apply the
  // auto-open intent once when there is finally something to show. After that
  // the user is in control of the toggle. Errors intentionally do NOT
  // auto-expand — the red border and status badge already signal the failure,
  // and the output stays one click away.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoAppliedRef.current && hasOutput && defaultOpen) {
      autoAppliedRef.current = true;
      setOpen(true);
    }
  }, [hasOutput, defaultOpen]);

  const toggle = () => {
    if (isExpandable) {
      setOpen((prev) => !prev);
    }
  };

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const didCopy = await copyTextToClipboard(command);
    if (!didCopy) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'group/cmd overflow-hidden rounded-md transition-colors duration-200',
        open ? 'border border-border/60 bg-muted/30' : 'border border-transparent',
        isExpandable && !open && 'hover:bg-muted/40',
      )}
    >
      {/* Row header — the description when there is one, otherwise the command */}
      <div
        role={isExpandable ? 'button' : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        aria-expanded={isExpandable ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (isExpandable && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
          }
        }}
        className={cn(
          'flex items-center gap-2 px-2 py-1 outline-none',
          isExpandable && 'cursor-pointer focus-visible:ring-1 focus-visible:ring-ring',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70 transition-transform duration-200',
            open && 'rotate-90',
            !isExpandable && 'opacity-0',
          )}
        />
        {hasDescription ? (
          <span className={cn('min-w-0 flex-1 truncate text-sm', isError ? 'text-red-600 dark:text-red-400' : 'text-foreground/90')}>
            {trimmedDescription}
          </span>
        ) : (
          <>
            <span className="flex-shrink-0 select-none font-mono text-xs font-semibold text-emerald-500 dark:text-emerald-400">
              $
            </span>
            {/* Not a <code> tag: the global `.chat-message code` rule forces
                `white-space: pre-wrap !important`, which would defeat `truncate`
                and render collapsed multi-line commands in full. */}
            <span
              className={cn(
                'min-w-0 flex-1 font-mono text-xs text-foreground',
                open ? 'whitespace-pre-wrap break-all' : 'truncate',
              )}
            >
              {command}
            </span>
          </>
        )}

        {isRunning && (
          <span className="h-2.5 w-2.5 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-emerald-400" />
        )}
        {status && status !== 'running' && <ToolStatusBadge status={status} className="flex-shrink-0" />}
        {!open && hasOutput && !isRunning && (
          <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/70 transition-opacity group-hover/cmd:opacity-0">
            {outputLineCount} {outputLineCount === 1 ? 'line' : 'lines'}
          </span>
        )}

        <button
          onClick={handleCopy}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground focus:opacity-100 group-hover/cmd:opacity-100"
          title={t('chat:misc.copyCommand')}
          aria-label={t('chat:misc.copyCommand')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded body: the command (when the header showed its description) and its output */}
      {open && (hasDescription || hasOutput) && (
        <div className="settings-content-enter border-t border-border/50 bg-background/50">
          {hasDescription && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
              <span className="select-none font-semibold text-emerald-500 dark:text-emerald-400">$ </span>
              {command}
            </pre>
          )}
          {hasOutput && (
            <pre
              className={cn(
                'max-h-80 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs leading-relaxed',
                hasDescription && 'border-t border-border/40',
                isError ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
              )}
            >
              {trimmedOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
