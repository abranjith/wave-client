import { RequestValidation, ValidationResult } from './validation';

/**
 * Internal Collection Types for Wave Client
 * These types are used throughout the app for storing and manipulating collections.
 * They support arbitrary nesting of folders.
 */

// ============================================================================
// URL Types
// ============================================================================

/**
 * Represents a URL with parsed components
 */
export interface CollectionUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: ParamRow[];
}

/**
 * Type guard to check if a URL is a CollectionUrl object
 */
export function isCollectionUrl(url: CollectionUrl | string | undefined): url is CollectionUrl {
  return typeof url === 'object' && url !== null && 'raw' in url;
}

/**
 * Extract the raw URL string from CollectionUrl or return string as-is
 */
export function getRawUrl(url: CollectionUrl | string | undefined): string {
  if (!url) return '';
  return isCollectionUrl(url) ? url.raw : url;
}

// ============================================================================
// File Reference Types
// ============================================================================

/**
 * Storage type for file references - extensible for future cloud/network support
 */
export type FileStorageType = 'local' | 'cloud' | 'network';

/**
 * Path type indicating how the file path should be resolved
 */
export type FilePathType = 'absolute' | 'relative';

/**
 * Reference to a file for request bodies and multipart form fields.
 * Stores metadata only - content is resolved at execution time.
 * This approach keeps types serializable and allows for deferred loading.
 */
export interface FileReference {
  /** File path (absolute or relative based on pathType) */
  path: string;
  /** Original file name for display and Content-Disposition */
  fileName: string;
  /** MIME type of the file */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Whether path is absolute or relative to app/workspace */
  pathType: FilePathType;
  /** Storage location type - allows future extension to cloud/network */
  storageType: FileStorageType;
}

// ============================================================================
// Request Body Types (Discriminated Union)
// ============================================================================

/**
 * Body type for no content
 */
export interface BodyNone {
  mode: 'none';
}

/**
 * Body type for raw text content (JSON, XML, HTML, plain text, CSV)
 */
export interface BodyRaw {
  mode: 'raw';
  raw: string;
  options?: {
    raw?: {
      language?: 'json' | 'xml' | 'html' | 'text' | 'csv';
    };
  };
}

/**
 * Body type for URL-encoded form data
 */
export interface BodyUrlEncoded {
  mode: 'urlencoded';
  urlencoded: FormField[];
}

/**
 * Body type for multipart form data (supports file uploads)
 */
export interface BodyFormData {
  mode: 'formdata';
  formdata: MultiPartFormField[];
}

/**
 * Body type for binary file upload
 * file is optional to support selecting file mode before choosing a file
 */
export interface BodyFile {
  mode: 'file';
  file?: FileReference;
}

/**
 * Discriminated union for all request body types.
 * Use the 'mode' field to determine the body structure.
 */
export type CollectionBody = BodyNone | BodyRaw | BodyUrlEncoded | BodyFormData | BodyFile;

/**
 * Helper to get body mode type
 */
export type BodyMode = CollectionBody['mode'];

/**
 * Helper to get raw body language options
 */
export type RawBodyLanguage = NonNullable<NonNullable<BodyRaw['options']>['raw']>['language'];

// ============================================================================
// Request Types
// ============================================================================

/**
 * Reference to original location in collection structure.
 * Used to track where a request came from for save operations.
 */
export interface CollectionReference {
  collectionFilename: string;
  collectionName: string;
  itemPath: string[]; // Path through folders to reach the item, e.g., ['Folder1', 'Subfolder']
}

/**
 * HTTP Request definition - THE unified request type.
 * Used for:
 * - Collection storage (persisted to disk)
 * - Tab state (active editing)
 * - History entries
 * - Request execution
 */
export interface CollectionRequest {
  /** Unique identifier for runtime tracking */
  id: string;
  /** Display name for the request */
  name: string;
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** Request URL - can be string or parsed URL object */
  url: CollectionUrl | string;
  /** Query parameters (extracted from URL or explicitly set) */
  query?: ParamRow[];
  /** HTTP headers */
  header?: HeaderRow[];
  /** Request body */
  body?: CollectionBody;
  /** Optional description/documentation */
  description?: string;
  /** Response validation rules */
  validation?: RequestValidation;
  /** Reference to auth configuration by ID */
  authId?: string;
  /** Reference to source collection (for collection-linked requests) */
  sourceRef?: CollectionReference;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Saved response for a request
 */
export interface CollectionResponse {
  id: string;
  name: string;
  originalRequest?: CollectionRequest;
  status: string;
  code: number;
  header?: HeaderRow[];
  body?: string;
  responseTime?: number;
}

// ============================================================================
// Collection Item Types
// ============================================================================

/**
 * A collection item - can be a request or a folder containing other items
 * Supports arbitrary nesting depth
 */
export interface CollectionItem {
  id: string; // Unique identifier for UI operations
  name: string;
  description?: string;
  request?: CollectionRequest;
  response?: CollectionResponse[];
  item?: CollectionItem[]; // For folders containing other items (supports infinite nesting)
}

/**
 * Collection metadata
 */
export interface CollectionInfo {
  waveId: string;
  name: string;
  description?: string;
  schema?: string;
  version?: string;
}

/**
 * Main Collection type - used throughout the app
 * Stored on disk and used directly in UI
 */
export interface Collection {
  info: CollectionInfo;
  item: CollectionItem[];
  filename?: string; // Added when loaded from disk
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Type guard to check if an item is a folder (has nested items)
 */
export function isFolder(item: CollectionItem): boolean {
  return Array.isArray(item.item) && !item.request;
}

/**
 * Type guard to check if an item is a request
 */
export function isRequest(item: CollectionItem): boolean {
  return item.request !== undefined;
}

/**
 * Represents a flattened folder path option for UI dropdowns
 */
export interface FolderPathOption {
  path: string[]; // Array of folder names from root to this folder
  displayPath: string; // Human-readable path like "Folder1 / Subfolder / Deep"
  depth: number; // Nesting depth (0 for root)
}

// ============================================================================
// Environment Types
// ============================================================================

export interface EnvironmentVariable {
  key: string;
  value: string;
  type: 'default' | 'secret';
  notes?: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  values: EnvironmentVariable[];
}

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
  disabled: boolean;
}

export interface ParamRow {
  id: string;
  key: string;
  value: string;
  disabled: boolean;
}

export interface FormField {
  id: string;
  key: string;
  value: string | null;
  disabled: boolean;
}

/**
 * Multipart form field - supports both text values and file references.
 * For file fields, value contains a FileReference (not the actual File object)
 * to ensure serializability. File content is resolved at execution time.
 */
export interface MultiPartFormField {
  id: string;
  key: string;
  /** Text value or FileReference for file fields */
  value: string | FileReference | null;
  disabled: boolean;
  fieldType: 'text' | 'file';
}

export interface ResponseData {
  id: string;
  status: number;
  statusText: string;
  elapsedTime: number;
  size: number;
  body: string;
  headers: Record<string, string>;
  validationResult?: ValidationResult;
  isEncoded: boolean;
}

export type ResponseContentType = 'none' | 'json' | 'xml' | 'html' | 'text' | 'csv' | 'binary';

// Cookie types
export interface Cookie {
  id: string;
  domain: string;
  path: string;
  name: string;
  value: string;
  expires?: string; // ISO date string or empty for session cookies
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  enabled: boolean;
}

// Proxy configuration interface
export interface Proxy {
    id: string; // Cryptographically unique per record
    name: string; // User-friendly name (must be unique)
    enabled: boolean; // Enable/disable flag
    domainFilters: string[]; // Will be used only for these domains (supports wildcards)
    excludeDomains: string[]; // Domains to explicitly exclude from proxy (supports wildcards)
    url: string; // Proxy server URL (e.g., "http://proxy.example.com:8080")
    userName?: string; // Optional username for proxy authentication
    password?: string; // Optional password for proxy authentication
}


// Base interface with common properties for all cert types
interface BaseCert {
    id: string; // Cryptographically unique per record
    name: string; // User-friendly name (must be unique)
    enabled: boolean; // Enable/disable flag
    domainFilters: string[]; // Will be sent only for these domains
    expiryDate?: string; // Optional expiry date (ISO string)
    passPhrase?: string; // Optional passphrase for encrypted key/pfx
}

// Cert type enum for type discrimination
export enum CertType {
    CA = 'ca',
    SELF_SIGNED = 'selfSigned',
}

// CA Certificate - only requires cert file
export interface CACert extends BaseCert {
    type: CertType.CA;
    certFile: string; // Path to certificate file
}

// Self-Signed Certificate - can have cert, key, pfx files and passphrase
export interface SelfSignedCert extends BaseCert {
    type: CertType.SELF_SIGNED;
    certFile?: string; // Path to certificate file (optional if using PFX)
    keyFile?: string; // Path to key file (optional if using PFX)
    pfxFile?: string; // Path to PFX file (optional if using cert+key)
}

// Union type for all cert types - makes it easy to add more types
export type Cert = CACert | SelfSignedCert;

// ============================================================================
// Type Aliases for Backwards Compatibility
// ============================================================================

/**
 * @deprecated Use CollectionRequest instead
 * ParsedRequest was renamed to CollectionRequest in the unified type system.
 * This alias is kept for backwards compatibility.
 */
export type ParsedRequest = CollectionRequest;
