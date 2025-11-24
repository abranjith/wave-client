// Collection types based on Postman collection structure

export interface CollectionUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: ParamRow[];
}

export interface CollectionBody {
  mode: string;
  raw?: string;
  binary?: {
    data: ArrayBuffer;
    fileName: string;
    contentType: string;
  };
}

export interface CollectionRequest {
  method: string;
  header?: HeaderRow[];
  url: CollectionUrl | string;
  body?: CollectionBody;
}

export interface CollectionItem {
  name: string;
  request?: CollectionRequest;
  response?: any[];
  item?: CollectionItem[]; // For folders containing other items
}

export interface CollectionInfo {
  _postman_id?: string;
  name: string;
  schema?: string;
}

export interface Collection {
  info: CollectionInfo;
  item: CollectionItem[];
}

// Environment types
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

export interface CollectionReference {
  collectionFilename: string;
  collectionName: string;
  itemPath: string[]; // Path through folders to reach the item, e.g., ['Folder1', 'Subfolder']
}

// Parsed collection types for easier use in components
export interface ParsedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HeaderRow[];
  params: ParamRow[];
  body: string | null;
  binaryBody?: {
    data: ArrayBuffer;
    fileName: string;
    contentType: string;
  };
  sourceRef: CollectionReference; // Reference back to original collection structure
}

export interface ParsedFolder {
  name: string;
  requests: ParsedRequest[];
  subfolders: ParsedFolder[];
}

export interface ParsedCollection {
  name: string;
  filename: string;
  folders: ParsedFolder[];
  requests: ParsedRequest[]; // Top-level requests not in folders
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
}

export type RequestBodyTextType = 'none' | 'json' | 'xml' | 'html' | 'text' | 'csv' | 'unknown';

export type RequestBodyType = 'none' | 'text' | 'binary' | 'form' | 'multipart';

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