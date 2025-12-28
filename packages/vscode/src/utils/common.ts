/**
 * Common utilities for the extension host (Node.js environment)
 * 
 * These are utilities that the extension backend services need that can't be
 * imported from @wave-client/core due to ESM/CJS compatibility issues.
 * 
 * Note: @wave-client/core exports ESM, but the extension host runs in CommonJS.
 * For Node.js utilities needed by services, we keep local copies here.
 */

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
    } catch {
        // If URL is invalid, return false
        return false;
    }
}

/**
 * Generates a unique ID using crypto.randomUUID
 * Falls back to a simple implementation if randomUUID is not available
 */
export function generateUniqueId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        // Fallback for environments without randomUUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
}
