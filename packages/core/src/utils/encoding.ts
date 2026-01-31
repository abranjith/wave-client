/**
 * Converts base64 string to UTF-8 text string
 */
export function base64ToText(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Decode as UTF-8
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (error) {
    console.error('Failed to decode base64:', error);
    return '';
  }
}

/**
 * Converts base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Attempts to parse base64 encoded JSON
 */
export function base64ToJson<T = any>(base64: string): T | null {
  try {
    const text = base64ToText(base64);
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON from base64:', error);
    return null;
  }
}


/**
 * Converts various data types to base64 string for safe transfer to webview
 */
export function convertToBase64(data: any): string {
    // Handle binary data types
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data).toString('base64');
    }
    
    if (Buffer.isBuffer(data)) {
        // Node.js Buffer (which is a Uint8Array subclass)
        return data.toString('base64');
    }
    
    if (data instanceof Uint8Array) {
        return Buffer.from(data).toString('base64');
    }
    
    // Handle string data
    if (typeof data === 'string') {
        return Buffer.from(data, 'utf8').toString('base64');
    }
    
    // Handle objects (JSON, etc.)
    if (data && typeof data === 'object') {
        try {
            return Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
        } catch (error) {
            // Fallback for objects that can't be stringified
            return Buffer.from('[Object: Unable to serialize]', 'utf8').toString('base64');
        }
    }
    
    // Fallback for any other type
    return Buffer.from(String(data), 'utf8').toString('base64');
}

/**
 * Decodes a base64 string to a Buffer
 */
export function base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
}