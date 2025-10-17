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