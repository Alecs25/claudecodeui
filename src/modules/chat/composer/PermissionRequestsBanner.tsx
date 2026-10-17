import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlertIcon } from 'lucide-react';

import type { PendingPermissionRequest } from '@/shared/types';
import {
  buildClaudeToolPermissionEntry,
  formatToolInputForDisplay,
  orderPermissionRequests,
  summarizePermissionInput,
} from '@/modules/chat/utils/chatPermissions';
import type { PermissionSubjectKind } from '@/modules/chat/utils/chatPermissions';
import { getClaudeSettings } from '@/modules/chat/utils/chatStorage';
import { getPermissionPanel, registerPermissionPanel } from '@/modules/chat/tools/configs/permissionPanelRegistry';
import { AskUserQuestionPanel } from '@/modules/chat/tools/InteractiveRenderers/AskUserQuestionPanel';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/modules/chat/composer/Confirmation';

registerPermissionPanel('AskUserQuestion', AskUserQuestionPanel);

const SUBJECT_LABELS: Record<PermissionSubjectKind, string> = {
  command: 'Command',
  file: 'File',
  url: 'URL',
  query: 'Query',
  pattern: 'Pattern',
  task: 'Task',
};

type PermissionRequestsBannerProps = {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
};

/**
 * Rendered by chat's ChatComposer above the input to surface pending tool
 * permission requests and their allow/deny/remember actions.
 *
 * One request at a time, oldest first, with how many are waiting: a stack of
 * prompts pushed the input off a phone screen, and answering them in the
 * order Claude asked is the order its tool calls wait on.
 */
export default function PermissionRequestsBanner({
  pendingPermissionRequests,
  handlePermissionDecision,
  handleGrantToolPermission,
}: PermissionRequestsBannerProps) {
  const { t } = useTranslation();
  // Filter out plan tool requests — they are handled inline by PlanDisplay
  const filteredRequests = orderPermissionRequests(pendingPermissionRequests.filter(
    (r) => r.toolName !== 'ExitPlanMode' && r.toolName !== 'exit_plan_mode'
  ));

  if (!filteredRequests.length) {
    return null;
  }

  const position = filteredRequests.length > 1 ? (
    <span className="ml-2 text-xs text-muted-foreground" data-testid="permission-queue-position">
      {t('chat:permissions.queuePosition', {
        current: 1,
        total: filteredRequests.length,
        defaultValue: '{{current}} of {{total}}',
      })}
    </span>
  ) : null;

  return (
    <div className="mb-3 space-y-2">
      {filteredRequests.slice(0, 1).map((request) => {
        const CustomPanel = getPermissionPanel(request.toolName);
        if (CustomPanel) {
          return (
            <div key={request.requestId}>
              {position && <div className="mb-1 text-right">{position}</div>}
              <CustomPanel
                request={request}
                onDecision={handlePermissionDecision}
              />
            </div>
          );
        }

        const rawInput = formatToolInputForDisplay(request.input);
        const subject = summarizePermissionInput(request.toolName, request.input);
        const permissionEntry = buildClaudeToolPermissionEntry(request.toolName, rawInput);
        const settings = getClaudeSettings();
        const alreadyAllowed = permissionEntry ? settings.allowedTools.includes(permissionEntry) : false;
        const rememberLabel = alreadyAllowed ? 'Allow (saved)' : 'Allow & remember';
        const matchingRequestIds = permissionEntry
          ? pendingPermissionRequests
              .filter(
                (item) =>
                  buildClaudeToolPermissionEntry(item.toolName, formatToolInputForDisplay(item.input)) === permissionEntry,
              )
              .map((item) => item.requestId)
          : [request.requestId];

        return (
          <Confirmation key={request.requestId} approval="pending">
            <ConfirmationTitle className="flex items-start gap-3">
              <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <ConfirmationRequest>
                <div>
                  <span className="font-medium text-foreground">Permission required</span>
                  <span className="ml-2 text-muted-foreground">
                    Tool: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{request.toolName}</code>
                  </span>
                  {position}
                </div>
                {subject && (
                  <div className="mt-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t(`chat:permissions.subject.${subject.kind}`, { defaultValue: SUBJECT_LABELS[subject.kind] })}
                    </div>
                    <pre
                      className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 px-2 py-1 font-mono text-xs text-foreground"
                      data-testid="permission-subject"
                    >
                      {subject.value}
                    </pre>
                  </div>
                )}
                {permissionEntry && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Allow rule: <code className="rounded bg-muted px-1 py-0.5 text-xs">{permissionEntry}</code>
                  </div>
                )}
              </ConfirmationRequest>
            </ConfirmationTitle>

            {rawInput && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  View tool input
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                  {rawInput}
                </pre>
              </details>
            )}

            <ConfirmationActions>
              <ConfirmationAction
                variant="outline"
                onClick={() => handlePermissionDecision(request.requestId, { allow: false, message: t('chat:misc.userDeniedTool') })}
              >
                Deny
              </ConfirmationAction>
              <ConfirmationAction
                variant="outline"
                onClick={() => {
                  if (permissionEntry && !alreadyAllowed) {
                    handleGrantToolPermission({ entry: permissionEntry, toolName: request.toolName });
                  }
                  handlePermissionDecision(matchingRequestIds, { allow: true, rememberEntry: permissionEntry });
                }}
                disabled={!permissionEntry}
              >
                {rememberLabel}
              </ConfirmationAction>
              <ConfirmationAction
                variant="default"
                onClick={() => handlePermissionDecision(request.requestId, { allow: true })}
              >
                Allow once
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
        );
      })}
    </div>
  );
}
