import React from 'react';

import { CollapsibleSection } from '@/modules/chat/tools/CollapsibleSection';
import { RawParameters } from '@/modules/chat/tools/RawParameters';

type CollapsibleDisplayProps = {
  toolName: string;
  toolId?: string;
  title: string;
  /** Extra classes for the title, e.g. `font-mono` for a file name that cannot be clicked. */
  titleClassName?: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  onTitleClick?: () => void;
  children: React.ReactNode;
  showRawParameters?: boolean;
  rawContent?: string;
  className?: string;
  toolCategory?: string;
};

const borderColorMap: Record<string, string> = {
  edit: 'border-l-amber-500 dark:border-l-amber-400',
  search: 'border-l-muted-foreground/40',
  bash: 'border-l-green-500 dark:border-l-green-400',
  todo: 'border-l-violet-500 dark:border-l-violet-400',
  task: 'border-l-violet-500 dark:border-l-violet-400',
  agent: 'border-l-purple-500 dark:border-l-purple-400',
  plan: 'border-l-indigo-500 dark:border-l-indigo-400',
  question: 'border-l-blue-500 dark:border-l-blue-400',
  default: 'border-l-border',
};

/**
 * Rendered by chat's ToolRenderer for tools configured to show their input and
 * result inside an expandable, category-coloured section, and by BashEditDiff
 * for each file a Bash command changed, so those read like the Edit rows.
 */
export const CollapsibleDisplay: React.FC<CollapsibleDisplayProps> = ({
  toolName,
  title,
  titleClassName,
  defaultOpen = false,
  action,
  badge,
  onTitleClick,
  children,
  showRawParameters = false,
  rawContent,
  className = '',
  toolCategory,
}) => {
  const borderColor = borderColorMap[toolCategory || 'default'] || borderColorMap.default;

  return (
    <div className={`border-l-2 ${borderColor} my-1 py-0.5 pl-3 ${className}`}>
      <CollapsibleSection
        title={title}
        titleClassName={titleClassName}
        toolName={toolName}
        open={defaultOpen}
        action={action}
        badge={badge}
        onTitleClick={onTitleClick}
      >
        {children}

        {showRawParameters && rawContent && (
          <RawParameters content={rawContent} />
        )}
      </CollapsibleSection>
    </div>
  );
};
