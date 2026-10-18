import path from 'node:path';

import { providerMcpService } from '@/modules/providers/index.js';
import { getModuleDirectory } from '@/shared/utils.js';

const __dirname = getModuleDirectory(import.meta.url);

/** Name the MCP server is registered under; the tool id derives from it. */
export const SESSION_SUGGESTIONS_MCP_SERVER_NAME = 'cloudcli-tasks';

/** Full tool id as the Claude SDK names it, for allowedTools and the session prompt. */
export const SUGGEST_SESSION_TOOL = `mcp__${SESSION_SUGGESTIONS_MCP_SERVER_NAME}__suggest_session`;

/** Used by the server entrypoint to register the MCP server at startup. */
export const sessionSuggestionsService = {
  /** Registers the stdio MCP server for Claude Code at user scope, so every session started by CloudCLI can suggest new sessions. */
  async registerAgentMcp(): Promise<void> {
    await providerMcpService.upsertProviderMcpServer('claude', {
      name: SESSION_SUGGESTIONS_MCP_SERVER_NAME,
      scope: 'user',
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(__dirname, 'session-suggestions-mcp.js')],
      env: {},
    });
  },
};
