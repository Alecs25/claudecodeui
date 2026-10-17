export { WS_OPEN_STATE, connectedClients } from './services/websocket-state.service.js';
export { createWebSocketServer } from './services/websocket-server.service.js';
export { chatRunRegistry } from './services/chat-run-registry.service.js';
// Consumed by the providers module's sessions watcher, which announces the
// sessions it (re)indexed from disk through the same builder the chat gateway
// uses, so both paths put the identical delta on the wire.
export { broadcastSessionUpserted, broadcastSessionUpsertedBatch } from './services/session-upsert-broadcast.service.js';
// runDetachedChatTurn: used by the scheduled-messages module to run a turn
// from a timer, with no socket to stream to or report errors on.
export { runDetachedChatTurn } from './services/chat-websocket.service.js';
export type { ProviderRuntimeGateway } from './services/chat-websocket.service.js';
// sessionRunStatus: used by the providers module's sessions service to apply
// sidebar status changes (pin, unread, completed), and by the server
// entrypoint as the run registry's start/end listener.
export { sessionRunStatus } from './services/session-run-status.service.js';
export type { SessionStatusFlags } from './services/session-run-status.service.js';
// viewerPresence: used by the server entrypoint to tell the notification
// orchestrator which sessions are on screen in a visible tab.
export { viewerPresence } from './services/viewer-presence.service.js';
