/**
 * Encoding utilities for the extension host (Node.js environment)
 * 
 * These utilities handle binary data encoding/decoding for HTTP response bodies.
 * They use Node.js Buffer API and are meant for extension host only, not webview.
 */

/**
 * Converts various data types to base64 string for safe transfer to webview
 */
export function convertToBase64(data: unknown): string {
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
        } catch {
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

/**
 * Decodes a base64 string to UTF-8 text
 */
export function base64ToText(base64: string): string {
    return Buffer.from(base64, 'base64').toString('utf8');
}
