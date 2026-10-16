import path from 'node:path';

/**
 * Project names taken from session titles.
 *
 * Sessions named in the Claude desktop app follow "PROJECT \ TOPIC"
 * ("HT \ CLOUDCLI", "TMC \ LINK CHAT"), while CloudCLI names a project after
 * its folder ("ht_odoo"). A project the user has not renamed in CloudCLI takes
 * the prefix its session titles use most, so both apps call it the same.
 */

// "PREFIX \ topic": the prefix is short and the separator is a backslash with
// spaces around it, so a Windows path in a title never matches.
const TITLE_PREFIX_PATTERN = /^\s*([^\\]{1,40}?)\s+\\\s+\S/;

/** The prefix most of these titles share, or null when none follows "PREFIX \ topic". Ties go to the first title seen. */
export function getMostUsedTitlePrefix(titles: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const prefix = typeof title === 'string' ? TITLE_PREFIX_PATTERN.exec(title)?.[1]?.trim() : undefined;
    if (prefix) {
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  let bestPrefix: string | null = null;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      bestPrefix = prefix;
      bestCount = count;
    }
  }
  return bestPrefix;
}

/**
 * True when the stored project name is only the default CloudCLI gave it (the
 * folder name, or nothing), so a name derived from session titles may replace it.
 */
export function isDefaultProjectName(customProjectName: string | null | undefined, projectPath: string): boolean {
  const trimmed = typeof customProjectName === 'string' ? customProjectName.trim() : '';
  return trimmed.length === 0 || trimmed === path.basename(projectPath);
}
