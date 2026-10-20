import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, FileText, X } from 'lucide-react';

import type { PermissionPanelProps } from '@/shared/types';
import { MarkdownContent } from '@/modules/chat/tools/ContentRenderers/MarkdownContent';
import { PromptCardButton, PromptCardFrame } from '@/modules/chat/tools/InteractiveRenderers/PromptCardFrame';

/**
 * Registered by chat's PermissionRequestsBanner as the panel for ExitPlanMode:
 * the plan in a scrollable area of the same card as the questions, with
 * Approve, or Reject with a reason the agent revises against.
 */
export const PlanApprovalPanel: React.FC<PermissionPanelProps> = ({ request, onDecision, textAnswerRef }) => {
  const { t } = useTranslation('chat');
  const input = request.input as { plan?: unknown } | undefined;
  const plan = typeof input?.plan === 'string' ? input.plan : '';
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  const approve = () => onDecision(request.requestId, { allow: true });

  // The deny message is what the agent reads back as the tool result.
  const reject = useCallback((text: string) => {
    const revise = t('misc.userAskedRevise');
    const trimmed = text.trim();
    onDecision(request.requestId, { allow: false, message: trimmed ? `${revise}: ${trimmed}` : revise });
  }, [onDecision, request.requestId, t]);

  const rejectWithText = useCallback((text: string) => {
    if (!text.trim()) {
      return false;
    }
    reject(text);
    return true;
  }, [reject]);

  useEffect(() => {
    if (!textAnswerRef) {
      return undefined;
    }
    textAnswerRef.current = rejectWithText;
    return () => {
      if (textAnswerRef.current === rejectWithText) {
        textAnswerRef.current = null;
      }
    };
  }, [rejectWithText, textAnswerRef]);

  return (
    <PromptCardFrame
      ref={frameRef}
      label={t('prompt.planQuestion')}
      icon={<FileText className="h-[18px] w-[18px]" aria-hidden />}
      chip={t('prompt.planChip')}
      actions={isRejecting ? (
        <>
          <PromptCardButton onClick={() => setIsRejecting(false)}>{t('plan.cancel')}</PromptCardButton>
          <PromptCardButton variant="primary" onClick={() => reject(reason)}>
            <X className="h-4 w-4" aria-hidden />
            {t('plan.sendRejection')}
          </PromptCardButton>
        </>
      ) : (
        <>
          <PromptCardButton onClick={() => setIsRejecting(true)}>
            <X className="h-4 w-4" aria-hidden />
            {t('prompt.rejectWithReason')}
          </PromptCardButton>
          <PromptCardButton variant="primary" onClick={approve}>
            <Check className="h-4 w-4" aria-hidden />
            {t('prompt.approve')}
          </PromptCardButton>
        </>
      )}
    >
      <p className="mb-2 text-[15px] font-semibold leading-snug">{t('prompt.planQuestion')}</p>
      <div
        className="max-h-[min(40vh,24rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-muted/20 px-3 py-2"
        data-testid="prompt-plan"
      >
        <MarkdownContent content={plan} className="prose prose-sm max-w-none break-words dark:prose-invert" />
      </div>
      {isRejecting && (
        <textarea
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              reject(reason);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setIsRejecting(false);
            }
          }}
          rows={3}
          aria-label={t('prompt.reason')}
          placeholder={t('prompt.reasonPlaceholder')}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-orange-500"
        />
      )}
    </PromptCardFrame>
  );
};
