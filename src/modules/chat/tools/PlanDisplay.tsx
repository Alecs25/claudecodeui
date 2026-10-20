import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, FileText, Hand, X } from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Shimmer,
} from '@/shared/ui';
import type { PendingPermissionRequest } from '@/shared/types';
import { usePermission } from '@/modules/chat/context/PermissionContext';
import { MarkdownContent } from '@/modules/chat/tools/ContentRenderers/MarkdownContent';
import { RawParameters } from '@/modules/chat/tools/RawParameters';
import { readPlanDecision, type PlanToolResult } from '@/modules/chat/utils/planDecision';

type PlanDisplayProps = {
  title: string;
  content: string;
  defaultOpen?: boolean;
  isStreaming?: boolean;
  showRawParameters?: boolean;
  rawContent?: string;
  toolName: string;
  toolId?: string;
  /** The plan tool's result: absent while the plan waits for an answer. */
  toolResult?: PlanToolResult;
};

const PLAN_TOOL_NAMES = new Set(['ExitPlanMode', 'exit_plan_mode']);

/**
 * The pending request for this plan. Requests carry no tool-use id, so with
 * two plans waiting (rare: a resumed tab) the one whose plan text matches wins.
 */
function findPlanRequest(requests: PendingPermissionRequest[], content: string): PendingPermissionRequest | undefined {
  const planRequests = requests.filter((request) => PLAN_TOOL_NAMES.has(request.toolName));
  const matching = planRequests.find((request) => {
    const input = request.input as { plan?: unknown } | undefined;
    return typeof input?.plan === 'string' && input.plan.trim() === content.trim();
  });
  return matching ?? planRequests[0];
}

/**
 * Rendered by chat's ToolRenderer for plan tools (ExitPlanMode): the proposed
 * plan as Markdown (tables included). While it waits, the card in the
 * composer's place takes the answer and this footer says so; once answered,
 * the footer says how.
 */
export const PlanDisplay: React.FC<PlanDisplayProps> = ({
  title,
  content,
  defaultOpen = false,
  isStreaming = false,
  showRawParameters = false,
  rawContent,
  toolName: _toolName,
  toolResult,
}) => {
  const { t } = useTranslation('chat');
  const decision = readPlanDecision(toolResult, t('misc.userAskedRevise'));
  const permissionCtx = usePermission();

  // The answer is given on the card that takes the composer's place; this one only says it waits.
  const pendingRequest = decision ? undefined : findPlanRequest(permissionCtx?.pendingPermissionRequests ?? [], content);

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className="my-1 flex flex-col shadow-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-4 pb-0 pt-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              {isStreaming ? <Shimmer>{title}</Shimmer> : title}
            </CardTitle>
          </div>
          <CollapsibleTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">{t('plan.toggle', { defaultValue: 'Toggle plan' })}</span>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-3">
            {content ? (
              <MarkdownContent
                content={content}
                className="prose prose-sm max-w-none dark:prose-invert"
              />
            ) : isStreaming ? (
              <div className="py-2">
                <Shimmer>{t('plan.generating', { defaultValue: 'Generating plan...' })}</Shimmer>
              </div>
            ) : null}

            {showRawParameters && rawContent && (
              <RawParameters content={rawContent} className="mt-3" />
            )}
          </CardContent>
        </CollapsibleContent>

        {pendingRequest && (
          <CardFooter className="border-t border-border/40 px-4 pb-3 pt-2 text-xs" data-testid="plan-waiting">
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
              <Hand className="h-3.5 w-3.5" aria-hidden />
              {t('plan.waiting')}
            </span>
          </CardFooter>
        )}

        {decision && (
          <CardFooter className="flex-col items-start gap-1 border-t border-border/40 px-4 pb-3 pt-2 text-xs">
            {decision.state === 'approved' ? (
              <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                <Check className="h-3.5 w-3.5" />
                {t('plan.approved', { defaultValue: 'Approved' })}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                  <X className="h-3.5 w-3.5" />
                  {t('plan.rejected', { defaultValue: 'Rejected' })}
                </span>
                {decision.feedback && (
                  <span className="whitespace-pre-wrap text-muted-foreground">{decision.feedback}</span>
                )}
              </>
            )}
          </CardFooter>
        )}
      </Card>
    </Collapsible>
  );
};
