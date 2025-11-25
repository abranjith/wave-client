import {RequestBodyTextType, RequestBodyType} from "../types/collection";
import { clsx, type ClassValue } from "clsx";
import { text } from "stream/consumers";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Determines the MIME type based on file extension
 * @param fileName - The name of the file including extension
 * @returns The appropriate MIME type or 'application/octet-stream' as default
 */
export function getContentTypeFromFileName(fileName: string): string {
  const extension = fileName.toLowerCase().split('.').pop();
  
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    
    // Video
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2',
    
    // Code/Text
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'csv': 'text/csv',
    'yaml': 'application/x-yaml',
    'yml': 'application/x-yaml',
    
    // Other common types
    'bin': 'application/octet-stream',
    'exe': 'application/x-msdownload',
    'dmg': 'application/x-apple-diskimage',
    'iso': 'application/x-iso9660-image',
  };
  
  return extension ? mimeTypes[extension] || 'application/octet-stream' : 'application/octet-stream';
}

/**
 * Determines file extension based on HTTP Content-Type header
 * @param contentType - The Content-Type header value (e.g., 'application/json', 'image/png; charset=utf-8')
 * @returns The appropriate file extension including the dot (e.g., '.json', '.png') or '.bin' as default
 */
export function getExtensionFromContentType(contentType: string): string {
  // Extract the main MIME type, ignoring parameters like charset
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  
  const extensionMap: Record<string, string> = {
    // Images
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    
    // Documents
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.oasis.opendocument.text': '.odt',
    'application/vnd.oasis.opendocument.spreadsheet': '.ods',
    'application/vnd.oasis.opendocument.presentation': '.odp',
    'application/rtf': '.rtf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
    
    // Audio
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/wave': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/webm': '.weba',
    'audio/opus': '.opus',
    'audio/midi': '.midi',
    'audio/x-midi': '.midi',
    
    // Video
    'video/mp4': '.mp4',
    'video/mpeg': '.mpeg',
    'video/x-msvideo': '.avi',
    'video/quicktime': '.mov',
    'video/x-ms-wmv': '.wmv',
    'video/x-flv': '.flv',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'video/3gpp': '.3gp',
    'video/3gpp2': '.3g2',
    'video/ogg': '.ogv',
    
    // Archives
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/vnd.rar': '.rar',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/x-tar': '.tar',
    'application/gzip': '.gz',
    'application/x-gzip': '.gz',
    'application/x-bzip': '.bz',
    'application/x-bzip2': '.bz2',
    'application/x-compress': '.z',
    'application/x-compressed': '.z',
    
    // Code/Text/Data
    'application/json': '.json',
    'application/ld+json': '.jsonld',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'text/html': '.html',
    'application/xhtml+xml': '.xhtml',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/javascript': '.js',
    'application/x-javascript': '.js',
    'application/typescript': '.ts',
    'text/typescript': '.ts',
    'application/yaml': '.yaml',
    'text/yaml': '.yaml',
    'application/x-yaml': '.yml',
    'text/x-yaml': '.yml',
    'application/toml': '.toml',
    'text/toml': '.toml',
    'application/x-sh': '.sh',
    'application/x-python': '.py',
    'text/x-python': '.py',
    'application/x-ruby': '.rb',
    'text/x-ruby': '.rb',
    'application/x-php': '.php',
    'text/x-php': '.php',
    'application/sql': '.sql',
    'text/x-sql': '.sql',
    
    // Fonts
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'font/ttf': '.ttf',
    'font/otf': '.otf',
    'application/font-woff': '.woff',
    'application/font-woff2': '.woff2',
    'application/x-font-ttf': '.ttf',
    'application/x-font-otf': '.otf',
    'application/vnd.ms-fontobject': '.eot',
    
    // Other common types
    'application/octet-stream': '.bin',
    'application/x-binary': '.bin',
    'application/x-msdownload': '.exe',
    'application/vnd.android.package-archive': '.apk',
    'application/vnd.apple.installer+xml': '.mpkg',
    'application/x-apple-diskimage': '.dmg',
    'application/x-iso9660-image': '.iso',
    'application/x-debian-package': '.deb',
    'application/x-redhat-package-manager': '.rpm',
    
    // E-books
    'application/epub+zip': '.epub',
    'application/x-mobipocket-ebook': '.mobi',
    'application/vnd.amazon.ebook': '.azw',
    
    // CAD
    'application/acad': '.dwg',
    'application/x-autocad': '.dwg',
    'image/vnd.dwg': '.dwg',
    'application/dxf': '.dxf',
    'image/vnd.dxf': '.dxf',
    
    // 3D Models
    'model/gltf+json': '.gltf',
    'model/gltf-binary': '.glb',
    'model/obj': '.obj',
    'model/stl': '.stl',
    'model/3mf': '.3mf',
    
    // Other data formats
    'application/vnd.google-earth.kml+xml': '.kml',
    'application/vnd.google-earth.kmz': '.kmz',
    'application/geo+json': '.geojson',
    'application/protobuf': '.pb',
    'application/x-protobuf': '.pb',
    'application/msgpack': '.msgpack',
    'application/x-msgpack': '.msgpack',
    
    // Certificates & Keys
    'application/x-x509-ca-cert': '.crt',
    'application/x-pem-file': '.pem',
    'application/pkcs8': '.p8',
    'application/pkcs10': '.p10',
    'application/pkcs12': '.p12',
    'application/x-pkcs12': '.pfx',
    
    // Web formats
    'application/wasm': '.wasm',
    'application/manifest+json': '.webmanifest',
    'image/x-xbitmap': '.xbm',
    'image/x-xpixmap': '.xpm',
  };
  
  return extensionMap[mimeType] || '.bin';
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
 * Determines the Content-Type header value based on request body configuration
 * @param bodyType - The type of request body ('none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary')
 * @param fileName - Optional file name to determine MIME type from extension
 * @param textType - Optional specific text type for raw body content
 * @returns Content-Type header value or null if no body
 */
export function getContentTypeFromBody(
  bodyType: RequestBodyType,
  fileName?: string | null,
  textType?: RequestBodyTextType | null
): string | null {
  // If body type is 'none', return null
  if (bodyType === 'none') {
    return null;
  }

  // If textType is specified, use that first
  if (textType && textType !== 'none') {
    const textTypeMap: Record<string, string> = {
      'text': 'text/plain',
      'json': 'application/json',
      'xml': 'application/xml',
      'html': 'text/html',
      'csv': 'text/csv'
    };
    return textTypeMap[textType] || 'text/plain';
  }

  // If fileName is provided, determine from extension
  if (fileName) {
    return getContentTypeFromFileName(fileName);
  }

  // Use reasonable defaults based on body type
  switch (bodyType) {
    case 'text':
      return 'text/plain';
    case 'multipart':
      return 'multipart/form-data';
    case 'form':
      return 'application/x-www-form-urlencoded';
    case 'binary':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
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
    default:
      return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
  }
}

/** * Removes the protocol (http:// or https://) from a given URL string.
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
    
    // Content Negotiation
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Content-Type',
    'Content-Encoding',
    'Content-Language',
    'Content-Length',
    
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
    'Upgrade',
    
    // Request Context
    'User-Agent',
    'Referer',
    'Host',
    'From',
    
    // Response Context
    'Server',
    'Allow',
    'Location',
    'Retry-After',
    
    // Range Requests
    'Range',
    'Accept-Ranges',
    'Content-Range',
    'If-Range',
    
    // Security
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'X-CSRF-Token',
    'X-Request-ID',
    'X-Correlation-ID',
    
    // Custom Headers
    'X-API-Key',
    'X-Auth-Token',
    'X-Requested-With',
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'X-Real-IP',
    
    // Other Common Headers
    'Date',
    'Via',
    'Warning',
    'Vary',
    'Link',
  ];
}