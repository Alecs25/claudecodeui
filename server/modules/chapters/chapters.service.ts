import path from 'node:path';

import { providerMcpService } from '@/modules/providers/index.js';
import { getModuleDirectory } from '@/shared/utils.js';

const __dirname = getModuleDirectory(import.meta.url);

export const CHAPTERS_MCP_SERVER_NAME = 'cloudcli-chapters';

/** Full tool id as the Claude SDK names it, for allowedTools and the session prompt. */
export const MARK_CHAPTER_TOOL = `mcp__${CHAPTERS_MCP_SERVER_NAME}__mark_chapter`;

export const chaptersService = {
  /** Registers the stdio MCP server for Claude Code at user scope, so every session started by CloudCLI can mark chapters. */
  async registerAgentMcp(): Promise<void> {
    await providerMcpService.upsertProviderMcpServer('claude', {
      name: CHAPTERS_MCP_SERVER_NAME,
      scope: 'user',
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(__dirname, 'chapters-mcp.js')],
      env: {},
    });
  },
};
