/**
 * RFC 7231-compliant default User-Agent for outbound Wave Client HTTP requests.
 *
 * The version is resolved from environment metadata when available and falls
 * back to a stable local default for runtime contexts where package metadata is
 * unavailable.
 */
const DEFAULT_WAVE_CLIENT_VERSION = '0.0.1';

/**
 * Resolves the current Wave Client version for the User-Agent header.
 */
function resolveWaveClientVersion(): string {
    const envVersion = process.env.WAVE_CLIENT_VERSION || process.env.npm_package_version;
    return envVersion && envVersion.trim().length > 0
        ? envVersion.trim()
        : DEFAULT_WAVE_CLIENT_VERSION;
}

export const WAVE_CLIENT_USER_AGENT = `WaveClient/${resolveWaveClientVersion()}`;
