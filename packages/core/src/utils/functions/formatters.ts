const MONTH_ABBREVIATIONS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

/**
 * Picks a random value from a non-empty list.
 */
export function pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * Returns an integer in the inclusive [min, max] range.
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a floating point value in [min, max].
 */
export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * Formats a numeric value with decimals and optional affixes.
 */
export function applyNumberFormat(
    value: number,
    decimals: number,
    prefix: string,
    suffix: string
): string {
    const numberString = decimals > 0 ? value.toFixed(decimals) : String(Math.trunc(value));
    return `${prefix}${numberString}${suffix}`;
}

/**
 * Expands a compact charset string such as A-Za-z0-9 into character list.
 */
export function expandCharsetDefinition(charset: string): string[] {
    const expanded: string[] = [];

    for (let i = 0; i < charset.length; i += 1) {
        const current = charset[i];
        const hasRange = i + 2 < charset.length && charset[i + 1] === '-';

        if (hasRange) {
            const end = charset[i + 2];
            const startCode = current.charCodeAt(0);
            const endCode = end.charCodeAt(0);

            if (startCode <= endCode) {
                for (let code = startCode; code <= endCode; code += 1) {
                    expanded.push(String.fromCharCode(code));
                }
                i += 2;
                continue;
            }
        }

        expanded.push(current);
    }

    return Array.from(new Set(expanded));
}

/**
 * Creates a random string from an expanded character set.
 */
export function randomFromCharset(length: number, charset: string[]): string {
    let output = '';
    for (let i = 0; i < length; i += 1) {
        output += pickRandom(charset);
    }
    return output;
}

/**
 * Formats dates/times using a small token set.
 */
export function formatDateTime(date: Date, format: string): string {
    const replacements: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        YY: String(date.getFullYear()).slice(-2),
        MMM: MONTH_ABBREVIATIONS[date.getMonth()],
        MM: pad2(date.getMonth() + 1),
        M: String(date.getMonth() + 1),
        DD: pad2(date.getDate()),
        D: String(date.getDate()),
        HH: pad2(date.getHours()),
        H: String(date.getHours()),
        mm: pad2(date.getMinutes()),
        m: String(date.getMinutes()),
        ss: pad2(date.getSeconds()),
        s: String(date.getSeconds()),
    };

    return format.replace(/YYYY|YY|MMM|MM|M|DD|D|HH|H|mm|m|ss|s/g, (token) => replacements[token]);
}

/**
 * Fills a format pattern by replacing each # with a random digit.
 */
export function fillDigitPattern(pattern: string): string {
    return pattern.replace(/#/g, () => String(randomInt(0, 9)));
}

/**
 * Parses an ISO date string as a Date, returning null when invalid.
 */
export function parseIsoDate(value: string): Date | null {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

    if (dateOnlyMatch) {
        const [, yearRaw, monthRaw, dayRaw] = dateOnlyMatch;
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        const day = Number(dayRaw);
        const parsedDate = new Date(year, month - 1, day);

        const isValidDate = parsedDate.getFullYear() === year
            && parsedDate.getMonth() === month - 1
            && parsedDate.getDate() === day;

        return isValidDate ? parsedDate : null;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}

/**
 * Parses HH:mm:ss / HH:mm / HH time strings into total seconds.
 */
export function parseTimeToSeconds(value: string): number | null {
    const parts = value.split(':').map((part) => part.trim());
    if (parts.length === 0 || parts.length > 3 || parts.some((part) => part.length === 0)) {
        return null;
    }

    const [hoursRaw, minutesRaw = '0', secondsRaw = '0'] = parts;
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    const seconds = Number(secondsRaw);

    if (
        !Number.isInteger(hours)
        || !Number.isInteger(minutes)
        || !Number.isInteger(seconds)
        || hours < 0
        || hours > 23
        || minutes < 0
        || minutes > 59
        || seconds < 0
        || seconds > 59
    ) {
        return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Creates a Date from seconds since midnight for formatting.
 */
export function timeFromSeconds(totalSeconds: number): Date {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return new Date(2000, 0, 1, hours, minutes, seconds, 0);
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);

    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(bytes);
    }

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
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

/**
 * Returns a v4 UUID using crypto.randomUUID when available.
 */
export function randomUuid(): string {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return bytesToUuid(randomBytes(16));
}
