/**
 * Common utilities for shared services
 */

/**
 * Generates a unique ID using timestamp and random characters
 */
export function generateUniqueId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Resolves environment variable placeholders in a string.
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
                const baseDomain = normalizedDomain.slice(2);
                // Match the base domain itself or any subdomain
                return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
            }

            // Handle dot-prefix domain (.example.com) - same as wildcard
            if (normalizedDomain.startsWith('.')) {
                const baseDomain = normalizedDomain.slice(1);
                return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
            }

            // Exact match
            return hostname === normalizedDomain;
        });
    } catch {
        return false;
    }
}

/**
 * Converts various data types to base64 string
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
