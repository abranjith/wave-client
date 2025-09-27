// Collection types based on Postman collection structure

export interface CollectionHeader {
  key: string;
  value: string;
}

export interface CollectionUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: Array<{
    key: string;
    value: string;
    disabled?: boolean;
  }>;
}

export interface CollectionBody {
  mode: string;
  raw?: string;
}

export interface CollectionRequest {
  method: string;
  header?: CollectionHeader[];
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
  headers: Record<string, string | string[]>;
  params: URLSearchParams;
  body: string;
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
