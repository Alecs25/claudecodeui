import { query } from '@anthropic-ai/claude-agent-sdk';

import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import type { ClaudeSideChat, SideChatEvent } from '@/shared/types.js';

/**
 * Side chat ("/btw"): a question about the session that must not become part
 * of it.
 *
 * The process resumes the session with `forkSession`, so it reads the whole
 * conversation up to now, and with `persistSession: false`, so the fork lives
 * only in that process: no transcript file is written, nothing reaches the
 * sidebar and there is nothing to clean up afterwards. Follow-up questions go
 * to the same process through a held input stream, which keeps the side
 * conversation's own context until it is closed.
 */

/** Tools that only read: a side chat answers questions, it never changes the project. Exported for tests. */
export const SIDE_CHAT_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'] as const;

const SIDE_CHAT_PROMPT = [
  '# Side chat',
  'This is a side question asked from CloudCLI while the main conversation continues elsewhere.',
  'Nothing you say here is added to the main conversation.',
  'Answer briefly and directly. You can read files and search, but never modify anything:',
  'if the question asks for a change, describe it instead of making it.',
].join('\n');

type SdkMessage = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  errors?: unknown;
  message?: { content?: unknown };
};

type SideChatQuery = AsyncIterable<SdkMessage> & { close?: () => void };

type StartClaudeSideChatInput = {
  providerSessionId: string;
  cwd: string;
  model?: string | null;
  onEvent: (event: SideChatEvent) => void;
};

type StartClaudeSideChatDependencies = {
  createQuery?: (input: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => SideChatQuery;
};

/** One line saying what a tool call looks at, for the "reading ..." row under the answer. */
function describeToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  for (const key of ['file_path', 'pattern', 'url', 'query', 'path']) {
    if (typeof record[key] === 'string' && record[key]) {
      return record[key] as string;
    }
  }
  return undefined;
}

/** Turns one SDK message into the events the client draws. Exported for tests. */
export function readSideChatEvents(message: SdkMessage): SideChatEvent[] {
  if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
    const events: SideChatEvent[] = [];
    for (const block of message.message.content as Array<Record<string, unknown>>) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        events.push({ event: 'text', text: block.text });
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        events.push({ event: 'tool', name: block.name, detail: describeToolInput(block.input) });
      }
    }
    return events;
  }
  if (message.type === 'result') {
    if (message.is_error || (message.subtype && message.subtype !== 'success')) {
      const detail = Array.isArray(message.errors) ? message.errors.join('; ') : message.result;
      return [{ event: 'error', error: detail || message.subtype || 'The side chat failed.' }];
    }
    return [{ event: 'done' }];
  }
  return [];
}

/** Keeps the CLI's stdin open between questions; see createHeldPromptStream in the runtime. */
function createQuestionStream() {
  const pending: unknown[] = [];
  let released = false;
  let wake: (() => void) | null = null;

  const stream = (async function* () {
    for (;;) {
      while (pending.length > 0) {
        yield pending.shift();
      }
      if (released) {
        return;
      }
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = null;
    }
  })();

  return {
    stream,
    push(message: unknown): boolean {
      if (released) {
        return false;
      }
      pending.push(message);
      wake?.();
      return true;
    },
    release() {
      released = true;
      wake?.();
    },
  };
}

/** SDK options of a side chat: a read-only, unpersisted fork. Exported for tests. */
export function buildSideChatOptions(input: Omit<StartClaudeSideChatInput, 'onEvent'>): Record<string, unknown> {
  const options: Record<string, unknown> = {
    cwd: input.cwd,
    resume: input.providerSessionId,
    forkSession: true,
    persistSession: false,
    env: { ...process.env },
    tools: [...SIDE_CHAT_TOOLS],
    allowedTools: [...SIDE_CHAT_TOOLS],
    // Belt and braces with `tools`: whatever else the CLI offers (MCP tools,
    // a future built-in) is refused without asking, since nobody is there to
    // answer a permission prompt for a side question.
    canUseTool: async (toolName: string, toolInput: Record<string, unknown>) => (
      (SIDE_CHAT_TOOLS as readonly string[]).includes(toolName)
        ? { behavior: 'allow', updatedInput: toolInput }
        : { behavior: 'deny', message: 'The side chat is read-only.' }
    ),
    systemPrompt: { type: 'preset', preset: 'claude_code', append: SIDE_CHAT_PROMPT },
    // No settings sources: the forked transcript already carries the
    // conversation, and the user's hooks and plugins should not fire for a
    // question that leaves no trace.
    settingSources: [],
  };
  if (input.model) {
    options.model = input.model;
  }
  const claudeExecutablePath = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
  if (claudeExecutablePath) {
    options.pathToClaudeCodeExecutable = claudeExecutablePath;
  }
  return options;
}

/** Used by the side-chat module (through the providers barrel) to answer /btw questions. */
export function startClaudeSideChat(
  input: StartClaudeSideChatInput,
  dependencies: StartClaudeSideChatDependencies = {},
): ClaudeSideChat {
  const questions = createQuestionStream();
  const createQuery = dependencies.createQuery
    ?? ((args) => query(args as Parameters<typeof query>[0]) as unknown as SideChatQuery);
  const instance = createQuery({ prompt: questions.stream, options: buildSideChatOptions(input) });
  let closed = false;

  void (async () => {
    try {
      for await (const message of instance) {
        if (closed) {
          return;
        }
        for (const event of readSideChatEvents(message)) {
          input.onEvent(event);
        }
      }
    } catch (error) {
      if (!closed) {
        input.onEvent({ event: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
  })();

  return {
    ask(text: string) {
      if (closed) {
        return false;
      }
      return questions.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        timestamp: new Date().toISOString(),
      });
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      questions.release();
      try {
        instance.close?.();
      } catch (error) {
        console.warn('[Claude SDK] Closing a side chat failed:', error instanceof Error ? error.message : error);
      }
    },
  };
}
