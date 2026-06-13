import { BodyMode, CollectionBody } from "../types/collection";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ResponseContentType } from '../types/collection';
import { isFunctionPlaceholder, resolveFunctionPlaceholder } from './functions';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// MIME Type Registry (single source of truth for content-type <-> extension)
// ============================================================================

/** Default content type when the file type is truly unknown */
const DEFAULT_BINARY_CONTENT_TYPE = 'application/octet-stream';
/** Default extension when the content type is truly unknown */
const DEFAULT_BINARY_EXTENSION = '.bin';

interface MimeTypeEntry {
  /** Canonical MIME type */
  mime: string;
  /** File extensions (without dot); the first one is the canonical extension */
  extensions: string[];
  /** Alternate/legacy MIME types that map to the same canonical extension */
  aliases?: string[];
}

/**
 * Canonical MIME type registry. Both lookup directions
 * (extension -> content type, content type -> extension) are derived from
 * this single table to avoid drift between the two mappings.
 * Entry order matters: when two entries share an extension, the first wins
 * (e.g. '.ts' resolves to TypeScript, not MPEG transport stream).
 */
const MIME_TYPE_REGISTRY: readonly MimeTypeEntry[] = [
  // Text & markup
  { mime: 'text/plain', extensions: ['txt', 'text', 'log'] },
  { mime: 'text/markdown', extensions: ['md', 'markdown'], aliases: ['text/x-markdown'] },
  { mime: 'text/csv', extensions: ['csv'] },
  { mime: 'text/tab-separated-values', extensions: ['tsv'] },
  { mime: 'text/html', extensions: ['html', 'htm'] },
  { mime: 'application/xhtml+xml', extensions: ['xhtml'] },
  { mime: 'text/css', extensions: ['css'] },
  { mime: 'text/calendar', extensions: ['ics'] },
  { mime: 'text/vcard', extensions: ['vcf'], aliases: ['text/x-vcard'] },
  { mime: 'application/rtf', extensions: ['rtf'], aliases: ['text/rtf'] },

  // Code & scripts
  { mime: 'text/javascript', extensions: ['js', 'mjs', 'cjs'], aliases: ['application/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'] },
  { mime: 'application/typescript', extensions: ['ts', 'tsx', 'mts', 'cts'], aliases: ['text/typescript', 'text/x-typescript'] },
  { mime: 'text/jsx', extensions: ['jsx'] },
  { mime: 'application/x-sh', extensions: ['sh', 'bash'], aliases: ['text/x-shellscript'] },
  { mime: 'text/x-python', extensions: ['py'], aliases: ['application/x-python', 'application/x-python-code'] },
  { mime: 'text/x-ruby', extensions: ['rb'], aliases: ['application/x-ruby'] },
  { mime: 'application/x-php', extensions: ['php'], aliases: ['text/x-php', 'application/x-httpd-php'] },
  { mime: 'text/x-java-source', extensions: ['java'] },
  { mime: 'text/x-c', extensions: ['c', 'h'] },
  { mime: 'text/x-c++', extensions: ['cpp', 'hpp', 'cc'] },
  { mime: 'text/x-csharp', extensions: ['cs'] },
  { mime: 'text/x-go', extensions: ['go'] },
  { mime: 'text/x-rust', extensions: ['rs'] },
  { mime: 'application/sql', extensions: ['sql'], aliases: ['text/x-sql', 'application/x-sql'] },
  { mime: 'application/graphql', extensions: ['graphql', 'gql'] },

  // Structured data
  { mime: 'application/json', extensions: ['json'], aliases: ['application/problem+json', 'application/hal+json', 'application/vnd.api+json', 'application/merge-patch+json', 'application/json-patch+json'] },
  { mime: 'application/ld+json', extensions: ['jsonld'] },
  { mime: 'application/x-ndjson', extensions: ['ndjson', 'jsonl'], aliases: ['application/jsonl', 'application/x-jsonlines'] },
  { mime: 'application/json5', extensions: ['json5'] },
  { mime: 'application/xml', extensions: ['xml', 'xsd'], aliases: ['text/xml', 'application/problem+xml'] },
  { mime: 'application/xslt+xml', extensions: ['xsl', 'xslt'] },
  { mime: 'application/yaml', extensions: ['yaml', 'yml'], aliases: ['application/x-yaml', 'text/yaml', 'text/x-yaml'] },
  { mime: 'application/toml', extensions: ['toml'], aliases: ['text/toml'] },
  { mime: 'application/jwt', extensions: ['jwt'] },
  { mime: 'application/geo+json', extensions: ['geojson'] },
  { mime: 'application/manifest+json', extensions: ['webmanifest'] },

  // Images
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg', 'jfif'] },
  { mime: 'image/png', extensions: ['png'] },
  { mime: 'image/apng', extensions: ['apng'] },
  { mime: 'image/gif', extensions: ['gif'] },
  { mime: 'image/webp', extensions: ['webp'] },
  { mime: 'image/avif', extensions: ['avif'] },
  { mime: 'image/heic', extensions: ['heic'] },
  { mime: 'image/heif', extensions: ['heif'] },
  { mime: 'image/svg+xml', extensions: ['svg'] },
  { mime: 'image/x-icon', extensions: ['ico'], aliases: ['image/vnd.microsoft.icon'] },
  { mime: 'image/bmp', extensions: ['bmp'] },
  { mime: 'image/tiff', extensions: ['tiff', 'tif'] },
  { mime: 'image/jxl', extensions: ['jxl'] },
  { mime: 'image/x-xbitmap', extensions: ['xbm'] },
  { mime: 'image/x-xpixmap', extensions: ['xpm'] },

  // Documents
  { mime: 'application/pdf', extensions: ['pdf'] },
  { mime: 'application/msword', extensions: ['doc'] },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'] },
  { mime: 'application/vnd.ms-excel', extensions: ['xls'] },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'] },
  { mime: 'application/vnd.ms-powerpoint', extensions: ['ppt'] },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['pptx'] },
  { mime: 'application/vnd.oasis.opendocument.text', extensions: ['odt'] },
  { mime: 'application/vnd.oasis.opendocument.spreadsheet', extensions: ['ods'] },
  { mime: 'application/vnd.oasis.opendocument.presentation', extensions: ['odp'] },

  // E-books
  { mime: 'application/epub+zip', extensions: ['epub'] },
  { mime: 'application/x-mobipocket-ebook', extensions: ['mobi'] },
  { mime: 'application/vnd.amazon.ebook', extensions: ['azw'] },

  // Audio
  { mime: 'audio/mpeg', extensions: ['mp3'], aliases: ['audio/mp3'] },
  { mime: 'audio/wav', extensions: ['wav'], aliases: ['audio/wave', 'audio/x-wav', 'audio/vnd.wave'] },
  { mime: 'audio/ogg', extensions: ['ogg', 'oga'] },
  { mime: 'audio/flac', extensions: ['flac'], aliases: ['audio/x-flac'] },
  { mime: 'audio/aac', extensions: ['aac'] },
  { mime: 'audio/mp4', extensions: ['m4a'], aliases: ['audio/x-m4a'] },
  { mime: 'audio/webm', extensions: ['weba'] },
  { mime: 'audio/opus', extensions: ['opus'] },
  { mime: 'audio/midi', extensions: ['midi', 'mid'], aliases: ['audio/x-midi'] },
  { mime: 'audio/amr', extensions: ['amr'] },

  // Video
  { mime: 'video/mp4', extensions: ['mp4', 'm4v'] },
  { mime: 'video/mpeg', extensions: ['mpeg', 'mpg'] },
  { mime: 'video/x-msvideo', extensions: ['avi'] },
  { mime: 'video/quicktime', extensions: ['mov'] },
  { mime: 'video/x-ms-wmv', extensions: ['wmv'] },
  { mime: 'video/x-flv', extensions: ['flv'] },
  { mime: 'video/webm', extensions: ['webm'] },
  { mime: 'video/x-matroska', extensions: ['mkv'] },
  { mime: 'video/3gpp', extensions: ['3gp'] },
  { mime: 'video/3gpp2', extensions: ['3g2'] },
  { mime: 'video/ogg', extensions: ['ogv'] },
  { mime: 'video/mp2t', extensions: ['m2ts', 'mts'] },

  // Streaming manifests
  { mime: 'application/vnd.apple.mpegurl', extensions: ['m3u8'], aliases: ['audio/mpegurl', 'audio/x-mpegurl'] },
  { mime: 'application/dash+xml', extensions: ['mpd'] },

  // Archives & compression
  { mime: 'application/zip', extensions: ['zip'], aliases: ['application/x-zip-compressed'] },
  { mime: 'application/vnd.rar', extensions: ['rar'], aliases: ['application/x-rar-compressed'] },
  { mime: 'application/x-7z-compressed', extensions: ['7z'] },
  { mime: 'application/x-tar', extensions: ['tar'] },
  { mime: 'application/gzip', extensions: ['gz', 'tgz'], aliases: ['application/x-gzip'] },
  { mime: 'application/x-bzip', extensions: ['bz'] },
  { mime: 'application/x-bzip2', extensions: ['bz2'] },
  { mime: 'application/x-xz', extensions: ['xz'] },
  { mime: 'application/zstd', extensions: ['zst'] },
  { mime: 'application/x-compress', extensions: ['z'], aliases: ['application/x-compressed'] },
  { mime: 'application/java-archive', extensions: ['jar'] },

  // Fonts
  { mime: 'font/woff', extensions: ['woff'], aliases: ['application/font-woff'] },
  { mime: 'font/woff2', extensions: ['woff2'], aliases: ['application/font-woff2'] },
  { mime: 'font/ttf', extensions: ['ttf'], aliases: ['application/x-font-ttf'] },
  { mime: 'font/otf', extensions: ['otf'], aliases: ['application/x-font-otf'] },
  { mime: 'font/collection', extensions: ['ttc'] },
  { mime: 'application/vnd.ms-fontobject', extensions: ['eot'] },

  // Executables, packages & disk images
  { mime: 'application/octet-stream', extensions: ['bin'], aliases: ['application/x-binary'] },
  { mime: 'application/x-msdownload', extensions: ['exe', 'dll'], aliases: ['application/x-msdos-program'] },
  { mime: 'application/x-msi', extensions: ['msi'] },
  { mime: 'application/vnd.android.package-archive', extensions: ['apk'] },
  { mime: 'application/vnd.apple.installer+xml', extensions: ['mpkg'] },
  { mime: 'application/x-apple-diskimage', extensions: ['dmg'] },
  { mime: 'application/x-iso9660-image', extensions: ['iso'] },
  { mime: 'application/x-debian-package', extensions: ['deb'], aliases: ['application/vnd.debian.binary-package'] },
  { mime: 'application/x-redhat-package-manager', extensions: ['rpm'], aliases: ['application/x-rpm'] },

  // Binary serialization & data formats
  { mime: 'application/wasm', extensions: ['wasm'] },
  { mime: 'application/protobuf', extensions: ['pb'], aliases: ['application/x-protobuf', 'application/vnd.google.protobuf'] },
  { mime: 'application/msgpack', extensions: ['msgpack'], aliases: ['application/x-msgpack', 'application/vnd.msgpack'] },
  { mime: 'application/cbor', extensions: ['cbor'] },
  { mime: 'application/avro', extensions: ['avro'], aliases: ['application/vnd.apache.avro+binary'] },
  { mime: 'application/vnd.apache.parquet', extensions: ['parquet'], aliases: ['application/x-parquet'] },
  { mime: 'application/vnd.sqlite3', extensions: ['sqlite', 'db'], aliases: ['application/x-sqlite3'] },
  { mime: 'application/vnd.google-earth.kml+xml', extensions: ['kml'] },
  { mime: 'application/vnd.google-earth.kmz', extensions: ['kmz'] },

  // Certificates & keys
  { mime: 'application/x-x509-ca-cert', extensions: ['crt', 'cer', 'der'] },
  { mime: 'application/x-pem-file', extensions: ['pem'] },
  { mime: 'application/pkcs8', extensions: ['p8', 'key'] },
  { mime: 'application/pkcs10', extensions: ['p10', 'csr'] },
  { mime: 'application/x-pkcs12', extensions: ['p12', 'pfx'], aliases: ['application/pkcs12'] },

  // CAD & 3D models
  { mime: 'image/vnd.dwg', extensions: ['dwg'], aliases: ['application/acad', 'application/x-autocad'] },
  { mime: 'image/vnd.dxf', extensions: ['dxf'], aliases: ['application/dxf'] },
  { mime: 'model/gltf+json', extensions: ['gltf'] },
  { mime: 'model/gltf-binary', extensions: ['glb'] },
  { mime: 'model/obj', extensions: ['obj'] },
  { mime: 'model/stl', extensions: ['stl'] },
  { mime: 'model/3mf', extensions: ['3mf'] },

  // Email
  { mime: 'message/rfc822', extensions: ['eml'] },
  { mime: 'application/vnd.ms-outlook', extensions: ['msg'] },
];

/** extension (without dot) -> canonical content type. Derived from MIME_TYPE_REGISTRY. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {};
/** content type (canonical or alias) -> canonical extension (with dot). Derived from MIME_TYPE_REGISTRY. */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {};

for (const entry of MIME_TYPE_REGISTRY) {
  const primaryExtension = `.${entry.extensions[0]}`;
  for (const extension of entry.extensions) {
    // First registry entry wins on extension conflicts
    if (!(extension in CONTENT_TYPE_BY_EXTENSION)) {
      CONTENT_TYPE_BY_EXTENSION[extension] = entry.mime;
    }
  }
  for (const mime of [entry.mime, ...(entry.aliases ?? [])]) {
    if (!(mime in EXTENSION_BY_CONTENT_TYPE)) {
      EXTENSION_BY_CONTENT_TYPE[mime] = primaryExtension;
    }
  }
}

/**
 * Determines the MIME type based on file extension
 * @param fileName - The name of the file including extension
 * @returns The appropriate MIME type or 'application/octet-stream' as default
 */
export function getContentTypeFromFileName(fileName: string): string {
  const extension = fileName.toLowerCase().trim().split('.').pop();
  return (extension && CONTENT_TYPE_BY_EXTENSION[extension]) || DEFAULT_BINARY_CONTENT_TYPE;
}

/**
 * Determines file extension based on HTTP Content-Type header
 * @param contentType - The Content-Type header value (e.g., 'application/json', 'image/png; charset=utf-8')
 * @returns The appropriate file extension including the dot (e.g., '.json', '.png') or '.bin' as default
 */
export function getExtensionFromContentType(contentType: string): string {
  // Extract the main MIME type, ignoring parameters like charset
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_CONTENT_TYPE[mimeType] || DEFAULT_BINARY_EXTENSION;
}


/**
 * Extracts the Content-Type header value from response headers (case-insensitive).
 * Multi-value headers are resolved to their first value.
 * @param headers - Response headers map
 * @returns The Content-Type header value, or '' if not present
 */
export function getResponseContentType(headers: Record<string, string | string[]>): string {
  const value = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

/**
 * Known text-based subtypes that don't fall under text/*, message/* or a
 * structured (+json/+xml/...) suffix. Mostly application/* code and config formats.
 */
const TEXT_BASED_SUBTYPES = new Set([
  'javascript', 'ecmascript', 'x-javascript',
  'typescript', 'x-typescript',
  'x-www-form-urlencoded',
  'yaml', 'x-yaml',
  'toml',
  'graphql',
  'sql', 'x-sql',
  'x-sh', 'x-shellscript',
  'x-httpd-php', 'x-php',
  'x-python', 'x-python-code',
  'x-perl',
  'x-ruby',
  'x-ndjson', 'jsonl', 'x-jsonlines', 'json5',
  'jwt',
  'rtf',
  'x-pem-file',
  'vnd.apple.mpegurl',
]);

/**
 * Determines the language/format from response headers.
 * Recognized text-based types map to their language; everything else is
 * treated as binary, since assuming text for an unknown type is unsafe.
 * A missing Content-Type header returns 'none' (nothing to classify —
 * e.g. 204 No Content responses).
 */
export function getResponseLanguage(headers: Record<string, string | string[]>): ResponseContentType {
  // Strip parameters like charset before classifying
  const mimeType = getResponseContentType(headers).split(';')[0].trim().toLowerCase();

  if (!mimeType) {
    return 'none';
  }

  const [type, subtype = ''] = mimeType.split('/');

  // Structured text formats — bare subtypes and structured-syntax suffixes
  // (e.g. application/problem+json, image/svg+xml, application/dash+xml)
  if (subtype === 'json' || subtype.endsWith('+json')) {
    return 'json';
  }
  if (subtype === 'xml' || subtype.endsWith('+xml')) {
    return 'xml';
  }
  if (subtype === 'html' || subtype.endsWith('+html')) {
    return 'html';
  }
  if (subtype === 'csv' || subtype.endsWith('+csv')) {
    return 'csv';
  }

  // All text/* and message/* types are textual by definition
  if (type === 'text' || type === 'message') {
    return 'text';
  }

  // Known text-based application/* formats (code, config, etc.)
  if (TEXT_BASED_SUBTYPES.has(subtype)) {
    return 'text';
  }

  // Unknown content type — treat as binary rather than assuming text
  return 'binary';
}

/**
 * Formats file size in human readable format
 * @param bytes - Size in bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Checks if a URI is URL-encoded.
 * @param uri - The URI string to check.
 * @returns True if the URI is URL-encoded, false otherwise.
 */
export function isUrlEncoded(uri: string): boolean {
  try {
    // Attempt to decode the URI component.
    // If it's already decoded or not encoded, decodeURIComponent will return the same string.
    // If it's encoded, it will return a different, decoded string.
    return uri !== decodeURIComponent(uri);
  } catch (e) {
    // Catch potential URIError if the string is not a valid URI component sequence
    // (e.g., malformed encoding). In such cases, it's likely encoded but malformed. But since we can't be sure, we return false.
    return false;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

/**
 * Parses the query parameters of a URL and returns them as an array of objects.
 * Each object contains the following properties:
 * - id: A unique identifier for the parameter (e.g., "param-1633036800000")
 * - key: The decoded key of the query parameter
 * - value: The decoded value of the query parameter
 * - disabled: A boolean indicating whether the parameter is disabled (always false in this implementation)
 * This function safely handles URL decoding and returns an empty array if the URL is invalid.
 * @param url - The URL string to parse
 * @returns 
 */
export function parseUrlQueryParams(url: string): { id: string; key: string; value: string; disabled: boolean }[] {
  try {
    const urlObj = new URL(url);
    const params = Array.from(urlObj.searchParams.entries());
    
    //make id random to avoid collisions when called multiple times in the same millisecond
    return params.map(([key, value]) => ({
      id: `param-${crypto.randomUUID()}`,
      key: safeDecodeURIComponent(key),
      value: safeDecodeURIComponent(value),
      disabled: false
    }));
  } catch (e) {
    // If URL is invalid, return empty array
    return [];
  }
}

/**
 * Content-Type values for raw body editor languages.
 * Shared by getContentTypeFromBodyMode and getContentTypeFromBody.
 */
const RAW_LANGUAGE_CONTENT_TYPES: Record<string, string> = {
  'json': 'application/json',
  'xml': 'application/xml',
  'html': 'text/html',
  'text': 'text/plain',
  'csv': 'text/csv',
};

/**
 * Determines the Content-Type header value based on request body configuration
 * @param bodyType - The type of request body ('none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary')
 * @param fileName - Optional file name to determine MIME type from extension
 * @param textType - Optional specific text type for raw body content
 * @returns Content-Type header value or null if no body
 * @deprecated Use getContentTypeFromBodyMode instead
 */
export function getContentTypeFromBody(
  bodyType: string,
  fileName?: string | null,
  textType?: string | null
): string | null {
  // If body type is 'none', return null
  if (bodyType === 'none') {
    return null;
  }

  // If textType is specified, use that first
  if (textType && textType !== 'none') {
    return RAW_LANGUAGE_CONTENT_TYPES[textType] || RAW_LANGUAGE_CONTENT_TYPES.text;
  }

  // If fileName is provided, determine from extension
  if (fileName) {
    return getContentTypeFromFileName(fileName);
  }

  // Use reasonable defaults based on body type
  switch (bodyType) {
    case 'text':
    case 'raw':
      return RAW_LANGUAGE_CONTENT_TYPES.text;
    case 'multipart':
    case 'formdata':
      return 'multipart/form-data';
    case 'form':
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'binary':
    case 'file':
    default:
      return DEFAULT_BINARY_CONTENT_TYPE;
  }
}

/**
 * Determines the Content-Type header value based on CollectionBody mode
 * @param body - The CollectionBody to get content type for
 * @returns Content-Type header value or null if no body
 */
export function getContentTypeFromBodyMode(body: CollectionBody | undefined): string | null {
  if (!body || body.mode === 'none') {
    return null;
  }

  switch (body.mode) {
    case 'raw': {
      const language = body.options?.raw?.language;
      return (language && RAW_LANGUAGE_CONTENT_TYPES[language]) || RAW_LANGUAGE_CONTENT_TYPES.text;
    }
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'formdata':
      // Let the HTTP client set this with the multipart boundary
      return null;
    case 'file':
      return body.file?.contentType || DEFAULT_BINARY_CONTENT_TYPE;
    default:
      return null;
  }
}

/**
 * Resolves parameterized placeholders in a string using environment variables
 * Supports {{variable}} syntax
 * @param value - The string value that may contain placeholders
 * @param environmentVariables - Map of environment variables (key -> value)
 * @returns Object with resolved string and array of unresolved placeholders
 */
export function resolveParameterizedValue(
  value: string,
  environmentVariables: Map<string, string>
): { resolved: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  
  const resolved = value.replace(placeholderRegex, (match, variableName) => {
    const trimmedName = variableName.trim();

    if (isFunctionPlaceholder(trimmedName)) {
      const functionResult = resolveFunctionPlaceholder(trimmedName);
      if (functionResult) {
        return functionResult.resolved;
      }

      unresolved.push(trimmedName);
      return match;
    }
    
    const matchingKey = Array.from(environmentVariables.keys()).find(
      key => key.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (matchingKey) {
      return environmentVariables.get(matchingKey)!;
    } else {
      unresolved.push(trimmedName);
      return match; // Keep original placeholder if unresolved
    }
  });
  
  return { resolved, unresolved };
}

/**
 * Returns Tailwind CSS classes for HTTP method badges
 * @param method - The HTTP method (e.g., 'GET', 'POST', etc.)
 * @returns Tailwind CSS classes for background and text color
 */
export function getHttpMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    case 'POST':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case 'PUT':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
    case 'DELETE':
      return 'bg-red-100 text-red-800 hover:bg-red-200';
    case 'PATCH':
      return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
    case 'HEAD':
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    case 'OPTIONS':
      return 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200';
    case 'WS':
      return 'bg-teal-100 text-teal-800 hover:bg-teal-200';
    case 'SSE':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
    default:
      return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
  }
}

/**
 * Removes the protocol (http:// or https://) from a given URL string.
 * If the URL is empty or only contains the protocol, returns an empty string.
 * @param fullUrl - The full URL string
 * @returns The URL without the protocol
 */
export function getUrlWithoutProtocol(fullUrl: string): string {
    if (!fullUrl) {
      return '';
    }
    // Remove protocol (http:// or https://)
    const withoutProtocol = fullUrl.replace(/^https?:\/\//, '');
    // If the result is empty or just '/', return empty string
    return withoutProtocol === '/' ? '' : withoutProtocol;
}

/*
  * Checks if a given URL's domain matches any in a list of domains.
  * Supports exact matches, wildcard subdomains (*.example.com), and dot-prefix (.example.com)
  * 
  * @param url - The URL to check
  * @param domains - Array of domain strings to match against
  * @returns True if the URL's domain matches any in the list, false otherwise
  */
export function isUrlInDomains(url: string, domains: string[]): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return domains.some(domain => {
      const normalizedDomain = domain.toLowerCase().trim();
      
      // Handle wildcard domain (*.example.com)
      if (normalizedDomain.startsWith('*.')) {
        const baseDomain = normalizedDomain.substring(2);
        return hostname.endsWith(baseDomain) && hostname !== baseDomain;
      }
      
      // Handle dot-prefix domain (.example.com) - matches example.com and all subdomains
      if (normalizedDomain.startsWith('.')) {
        const baseDomain = normalizedDomain.substring(1);
        return hostname === baseDomain || hostname.endsWith(normalizedDomain);
      }
      
      // Exact match
      return hostname === normalizedDomain;
    });
  } catch (e) {
    // If URL is invalid, return false
    return false;
  }
}

/**
 * Returns a list of common HTTP header names used in requests
 * @returns Array of common header names
 */
export function getCommonHeaderNames(): string[] {
  return [
    // Authentication & Authorization
    'Authorization',
    'WWW-Authenticate',
    'Proxy-Authorization',
    'Proxy-Authenticate',
    
    // Content Negotiation & Representation
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Accept-Patch',
    'Accept-Post',
    'Content-Type',
    'Content-Encoding',
    'Content-Language',
    'Content-Length',
    'Content-Disposition',
    'Content-Location',
    'Content-Digest',
    'Repr-Digest',
    'Want-Content-Digest',

    // Caching
    'Cache-Control',
    'Pragma',
    'Expires',
    'ETag',
    'If-Match',
    'If-None-Match',
    'If-Modified-Since',
    'If-Unmodified-Since',
    'Last-Modified',
    'Age',
    
    // Cookies
    'Cookie',
    'Set-Cookie',
    
    // CORS
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Credentials',
    'Access-Control-Expose-Headers',
    'Access-Control-Max-Age',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Origin',
    
    // Connection Management
    'Connection',
    'Keep-Alive',
    'Transfer-Encoding',
    'TE',
    'Trailer',
    'Upgrade',

    // Request Context
    'User-Agent',
    'Referer',
    'Host',
    'From',
    'Expect',
    'Max-Forwards',
    'Prefer',
    'Preference-Applied',
    'Idempotency-Key',
    'Last-Event-ID',

    // Response Context
    'Server',
    'Allow',
    'Location',
    'Retry-After',
    'Alt-Svc',
    'Server-Timing',
    'Timing-Allow-Origin',
    'Sunset',
    'Deprecation',

    // Range Requests
    'Range',
    'Accept-Ranges',
    'Content-Range',
    'If-Range',
    
    // Security
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'Content-Security-Policy-Report-Only',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'X-CSRF-Token',
    'X-Request-ID',
    'X-Correlation-ID',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Embedder-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Clear-Site-Data',
    'Upgrade-Insecure-Requests',

    // Fetch Metadata
    'Sec-Fetch-Dest',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Site',
    'Sec-Fetch-User',

    // WebSockets
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Accept',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Version',
    'Sec-WebSocket-Extensions',

    // Proxies & Custom Headers
    'X-API-Key',
    'X-Auth-Token',
    'X-Requested-With',
    'Forwarded',
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'X-Forwarded-Port',
    'X-Real-IP',

    // Rate Limiting
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',

    // Other Common Headers
    'Date',
    'Via',
    'Warning',
    'Vary',
    'Link',
    'Priority',
  ];
}


// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique ID
 */
export function generateUniqueId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const browserGetRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (browserGetRandomValues) {
    return bytesToUuid(generateRandomBytes(() => browserGetRandomValues(new Uint8Array(16))));
  }

  try {
     
    const nodeCrypto = typeof require !== 'undefined' ? require('crypto') : undefined;
    if (nodeCrypto?.randomBytes) {
      return bytesToUuid(nodeCrypto.randomBytes(16));
    }
  } catch (error) {
    // Ignore and fall back to Math.random-based UUID.
  }

  return bytesToUuid(generateRandomBytes());
}

function generateRandomBytes(generator?: () => Uint8Array): Uint8Array {
  if (generator) {
    return generator();
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const mutable = new Uint8Array(bytes);
  mutable[6] = (mutable[6] & 0x0f) | 0x40;
  mutable[8] = (mutable[8] & 0x3f) | 0x80;

  const hex = Array.from(mutable, (value) => value.toString(16).padStart(2, '0'));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}
