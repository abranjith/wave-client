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
}

export interface MultiPartFormField {
  id: string;
  key: string;
  value: string | File | null;
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