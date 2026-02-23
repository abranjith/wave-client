/**
 * Type definitions for extension host services
 * 
 * Re-exports types from @wave-client/shared for convenience.
 * Some types are kept locally for VS Code-specific functionality.
 */

// Import CollectionRequest for the type alias
import type { CollectionRequest } from '@wave-client/shared';

// Re-export all types from shared
export {
    type Collection,
    type CollectionItem,
    type CollectionRequest,
    type CollectionInfo,
    type CollectionUrl,
    type CollectionBody,
    type HeaderRow,
    type ParamRow,
    type FormField,
    type Environment,
    type EnvironmentVariable,
    type Cookie,
    type Proxy,
    type Cert,
    type CACert,
    type SelfSignedCert,
    CertType,
    type ResponseData,
    type ValidationResult,
    type ValidationRuleResult,
    isFolder,
    isRequest,
} from '@wave-client/shared';

// ============================================================
// Arena postMessage payload types
// ============================================================

import type {
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaReference,
    ArenaSettings,
    ArenaProviderSettingsMap,
    ArenaProviderSettings,
    ArenaProviderType,
    ArenaChatRequest,
} from '@wave-client/shared';

// Storage — sessions
export interface ArenaLoadSessionsMsg   { type: 'arena.loadSessions';   requestId: string }
export interface ArenaSaveSessionMsg    { type: 'arena.saveSession';    requestId: string; session: ArenaSession }
export interface ArenaDeleteSessionMsg  { type: 'arena.deleteSession';  requestId: string; sessionId: string }

// Storage — messages
export interface ArenaLoadMessagesMsg    { type: 'arena.loadMessages';         requestId: string; sessionId: string }
export interface ArenaSaveMessageMsg     { type: 'arena.saveMessage';          requestId: string; message: ArenaMessage }
export interface ArenaClearMessagesMsg   { type: 'arena.clearSessionMessages'; requestId: string; sessionId: string }

// Storage — documents
export interface ArenaLoadDocumentsMsg   { type: 'arena.loadDocuments';   requestId: string }
export interface ArenaUploadDocumentMsg  { type: 'arena.uploadDocument';  requestId: string; metadata: ArenaDocument; contentBase64: string }
export interface ArenaDeleteDocumentMsg  { type: 'arena.deleteDocument';  requestId: string; documentId: string }

// Storage — settings & references
export interface ArenaLoadSettingsMsg         { type: 'arena.loadSettings';         requestId: string }
export interface ArenaSaveSettingsMsg         { type: 'arena.saveSettings';         requestId: string; settings: ArenaSettings }
export interface ArenaLoadReferencesMsg       { type: 'arena.loadReferences';       requestId: string }
export interface ArenaSaveReferencesMsg       { type: 'arena.saveReferences';       requestId: string; references: ArenaReference[] }
export interface ArenaLoadProviderSettingsMsg { type: 'arena.loadProviderSettings'; requestId: string }
export interface ArenaSaveProviderSettingsMsg { type: 'arena.saveProviderSettings'; requestId: string; settings: ArenaProviderSettingsMap }

// Actions
// Deviation A: adapter sends { provider, apiKey } (matching IArenaAdapter.validateApiKey signature)
export interface ArenaValidateApiKeyMsg     { type: 'arena.validateApiKey';    requestId: string; provider: string; apiKey: string }
// Deviation B: adapter sends only { provider }; handler loads providerSettings from arenaStorageService
export interface ArenaGetAvailableModelsMsg { type: 'arena.getAvailableModels'; requestId: string; provider: string }

// Streaming
export interface ArenaStreamMessageMsg { type: 'arena.streamMessage'; requestId: string; chatRequest: ArenaChatRequest }
export interface ArenaCancelChatMsg    { type: 'arena.cancelChat';    sessionId: string }  // no requestId — fire-and-forget

/** Discriminated union of all Arena postMessage protocol messages. */
export type ArenaPostMessage =
    | ArenaLoadSessionsMsg
    | ArenaSaveSessionMsg
    | ArenaDeleteSessionMsg
    | ArenaLoadMessagesMsg
    | ArenaSaveMessageMsg
    | ArenaClearMessagesMsg
    | ArenaLoadDocumentsMsg
    | ArenaUploadDocumentMsg
    | ArenaDeleteDocumentMsg
    | ArenaLoadSettingsMsg
    | ArenaSaveSettingsMsg
    | ArenaLoadReferencesMsg
    | ArenaSaveReferencesMsg
    | ArenaLoadProviderSettingsMsg
    | ArenaSaveProviderSettingsMsg
    | ArenaValidateApiKeyMsg
    | ArenaGetAvailableModelsMsg
    | ArenaStreamMessageMsg
    | ArenaCancelChatMsg;
