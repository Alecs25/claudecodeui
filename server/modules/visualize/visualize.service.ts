import path from 'node:path';

import { providerMcpService } from '@/modules/providers/index.js';
import { getModuleDirectory } from '@/shared/utils.js';

const __dirname = getModuleDirectory(import.meta.url);

export const VISUALIZE_MCP_SERVER_NAME = 'cloudcli-visualize';

export const visualizeService = {
  /** Registers the stdio MCP server for Claude Code at user scope, so every session started by CloudCLI can draw inline widgets. */
  async registerAgentMcp(): Promise<void> {
    await providerMcpService.upsertProviderMcpServer('claude', {
      name: VISUALIZE_MCP_SERVER_NAME,
      scope: 'user',
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(__dirname, 'visualize-mcp.js')],
      env: {},
    });
  },
};
