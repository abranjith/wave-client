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
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  values: EnvironmentVariable[];
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
  folderPath: string[];
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

export interface ResponseData {
  status: number;
  statusText: string;
  elapsedTime: number;
  size: number;
  body: string;
  headers: Record<string, string>;
}