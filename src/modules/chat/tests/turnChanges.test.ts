import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/shared/types';
import { collectFileChanges, findTurnFileChanges } from '@/modules/chat/utils/turnChanges';
import { groupConsecutiveTools } from '@/modules/chat/utils/toolGrouping';

const at = new Date('2026-10-17T10:00:00Z');
let toolSeq = 0;
const user = (content: string): ChatMessage => ({ type: 'user', content, timestamp: at });
const assistant = (content: string): ChatMessage => ({ type: 'assistant', content, timestamp: at });
const tool = (toolName: string, toolInput: unknown, isError = false): ChatMessage => ({
  type: 'tool',
  content: '',
  timestamp: at,
  isToolUse: true,
  toolName,
  toolInput,
  toolId: `${toolName}-${toolSeq++}`,
  toolResult: { content: isError ? 'failed' : 'ok', isError },
});

describe('collectFileChanges', () => {
  it('groups Edit, MultiEdit and Write calls by file in first-touched order', () => {
    const changes = collectFileChanges([
      tool('Edit', { file_path: '/a.ts', old_string: 'one', new_string: 'two' }),
      tool('Write', JSON.stringify({ file_path: '/b.ts', content: 'new file' })),
      tool('MultiEdit', { file_path: '/a.ts', edits: [{ old_string: 'x', new_string: 'y' }, { old_string: 'p', new_string: 'q' }] }),
    ]);

    expect(changes.map((change) => change.filePath)).toEqual(['/a.ts', '/b.ts']);
    expect(changes[0].edits).toEqual([
      { oldContent: 'one', newContent: 'two', kind: 'edit' },
      { oldContent: 'x', newContent: 'y', kind: 'edit' },
      { oldContent: 'p', newContent: 'q', kind: 'edit' },
    ]);
    expect(changes[1].edits).toEqual([{ oldContent: '', newContent: 'new file', kind: 'write' }]);
  });

  it('skips failed calls and tools that carry no diff', () => {
    expect(collectFileChanges([
      tool('Edit', { file_path: '/a.ts', old_string: 'one', new_string: 'two' }, true),
      tool('Bash', { command: 'sed -i s/a/b/ x' }),
      tool('Read', { file_path: '/a.ts' }),
    ])).toEqual([]);
  });
});

describe('findTurnFileChanges', () => {
  const messages = [
    user('first'),
    tool('Edit', { file_path: '/a.ts', old_string: 'one', new_string: 'two' }),
    assistant('done'),
    user('second'),
    assistant('nothing to change'),
    user('third'),
    tool('Write', { file_path: '/c.ts', content: 'c' }),
  ];

  it('keys each changing turn by its last row and leaves the running turn out', () => {
    const items = groupConsecutiveTools(messages, false);
    const byIndex = findTurnFileChanges(items, false);
    const firstTurnEnd = items.indexOf(messages[2]);

    expect([...byIndex.keys()]).toEqual([firstTurnEnd]);
    expect(byIndex.get(firstTurnEnd)?.[0].filePath).toBe('/a.ts');
  });

  it('includes the last turn once it has ended', () => {
    const items = groupConsecutiveTools(messages, false);
    const byIndex = findTurnFileChanges(items, true);

    expect(byIndex.size).toBe(2);
    expect(byIndex.get(items.length - 1)?.[0].filePath).toBe('/c.ts');
  });
});
