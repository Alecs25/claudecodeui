import { FolderOpen, Plus } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ActionMenu } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { Project } from '@/shared/types';

type NewSessionMenuProps = {
  /** The projects in sidebar order. */
  projects: Project[];
  /** The folder in view, listed first; null when there is none. */
  newSessionProject: Project | null;
  onNewSession: (project: Project) => void;
  /** Picks any folder (it becomes a project) and starts a session there. */
  onChooseFolderForSession: () => void;
  /** `button` is the full-width button of the sidebar header, `icon` the square one on the rail. */
  variant: 'button' | 'icon';
  t: TFunction;
};

const buttonClassName =
  'flex h-10 w-full items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent';
const iconClassName =
  'flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90';

/**
 * "New session", shared by the sidebar header and the collapsed rail. Asks
 * where, as Claude Code does: the folder in view first, the other projects,
 * then any folder on the machine. With no project yet it goes straight to the
 * folder picker.
 */
export default function NewSessionMenu({
  projects,
  newSessionProject,
  onNewSession,
  onChooseFolderForSession,
  variant,
  t,
}: NewSessionMenuProps) {
  const newSessionLabel = t('sessions.newSession');
  const isIcon = variant === 'icon';

  if (projects.length === 0) {
    return (
      <button
        type="button"
        className={isIcon ? iconClassName : buttonClassName}
        onClick={onChooseFolderForSession}
        aria-label={isIcon ? newSessionLabel : undefined}
        title={isIcon ? newSessionLabel : undefined}
      >
        <Plus className="h-4 w-4 flex-shrink-0" />
        {!isIcon && <span className="truncate">{newSessionLabel}</span>}
      </button>
    );
  }

  const orderedSessionProjects = newSessionProject
    ? [newSessionProject, ...projects.filter((project) => project.projectId !== newSessionProject.projectId)]
    : projects;
  const currentFolderLabel = t('sessions.currentFolder', { defaultValue: 'Current' });

  return (
    <ActionMenu
      label={newSessionLabel}
      ariaLabel={isIcon ? newSessionLabel : undefined}
      icon={Plus}
      iconOnly={isIcon}
      align={isIcon ? 'left' : 'right'}
      portal
      variant="ghost"
      size={isIcon ? 'icon' : undefined}
      className={isIcon ? undefined : 'flex w-full'}
      triggerClassName={isIcon ? iconClassName : cn(buttonClassName, 'justify-start [&>span]:flex-1 [&>span]:text-left')}
      menuClassName="max-h-[60vh] w-[260px] overflow-y-auto rounded-xl p-1.5 shadow-xl"
      header={(
        <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('sessions.folder', { defaultValue: 'Folder' })}
        </p>
      )}
      items={[
        ...orderedSessionProjects.map((project) => ({
          key: project.projectId,
          label: project.displayName,
          description: project.projectId === newSessionProject?.projectId ? currentFolderLabel : undefined,
          onSelect: () => onNewSession(project),
        })),
        {
          key: 'choose-folder',
          label: t('sessions.chooseFolder', { defaultValue: 'Choose folder…' }),
          icon: FolderOpen,
          showDividerBefore: true,
          onSelect: onChooseFolderForSession,
        },
      ]}
    />
  );
}
