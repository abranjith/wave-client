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
    
    //make id random to avoid collisions when called multiple times in the same millisecond. use crypto if available
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
