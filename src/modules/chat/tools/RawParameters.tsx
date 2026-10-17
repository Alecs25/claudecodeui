import React from 'react';
import { useTranslation } from 'react-i18next';

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/shared/ui';
import { useIsVerboseTranscript } from '@/modules/chat/context/TranscriptViewModeContext';

type RawParametersProps = {
  content: string;
  className?: string;
};

/**
 * Rendered by chat's tool displays under a call when raw parameters are on:
 * the tool input exactly as the provider sent it. Open by default in the
 * Verbose transcript mode, where showing it is the point.
 */
export const RawParameters: React.FC<RawParametersProps> = ({ content, className = 'mt-2' }) => {
  const { t } = useTranslation('chat');
  const isVerbose = useIsVerboseTranscript();

  return (
    <Collapsible key={isVerbose ? 'verbose' : 'compact'} defaultOpen={isVerbose} className={className}>
      <CollapsibleTrigger className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
        <svg
          className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-150 data-[state=open]:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {t('viewMode.rawParameters', { defaultValue: 'Raw parameters' })}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 overflow-hidden whitespace-pre-wrap break-words rounded border border-border/40 bg-muted p-2 font-mono text-[11px] text-muted-foreground">
          {content}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
};
