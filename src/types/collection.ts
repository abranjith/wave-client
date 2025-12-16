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

// ============================================================================
// Request Body Types
// ============================================================================

/**
 * Binary file data for request body
 */
export interface BinaryBodyData {
  data: ArrayBuffer;
  fileName: string;
  contentType: string;
}

/**
 * Request body with multiple modes
 */
export interface CollectionBody {
  mode: 'none' | 'raw' | 'urlencoded' | 'formdata' | 'file';
  raw?: string;
  urlencoded?: FormField[];
  formdata?: MultiPartFormField[];
  binary?: BinaryBodyData;
  options?: {
    raw?: {
      language?: 'json' | 'xml' | 'html' | 'text' | 'csv';
    };
  };
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * HTTP Request definition
 */
export interface CollectionRequest {
  method: string;
  url: CollectionUrl | string;
  header?: HeaderRow[];
  body?: CollectionBody;
  description?: string;
  validation?: RequestValidation;
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
 * Reference to original location in collection structure
 */
export interface CollectionReference {
  collectionFilename: string;
  collectionName: string;
  itemPath: string[]; // Path through folders to reach the item, e.g., ['Folder1', 'Subfolder']
}

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
// UI Request Types (for forms and tabs)
// ============================================================================

/**
 * Request data format used in UI forms and tabs
 * This is the "unpacked" version of a request for easy editing
 */
export interface ParsedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HeaderRow[];
  params: ParamRow[];
  body: string | null;
  bodyMode?: CollectionBody['mode'];
  bodyOptions?: CollectionBody['options'];
  binaryBody?: BinaryBodyData;
  sourceRef: CollectionReference;
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

export interface MultiPartFormField {
  id: string;
  key: string;
  value: string | File | null;
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
}

export type RequestBodyTextType = 'none' | 'json' | 'xml' | 'html' | 'text' | 'csv' | 'unknown';

export type RequestBodyType = 'none' | 'text' | 'binary' | 'form' | 'multipart';

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
