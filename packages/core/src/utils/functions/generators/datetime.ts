import type { FnDefinition } from '../types';
import {
    formatDateTime,
    parseIsoDate,
    parseTimeToSeconds,
    randomInt,
    timeFromSeconds,
} from '../formatters';

function defaultMinDateString(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 50);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultMaxDateString(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const currentDateDefinition: FnDefinition = {
    name: '_fn_current_date',
    description: 'Returns the current date in the requested format.',
    args: [
        {
            name: 'format',
            description: 'Date format tokens (YYYY, MM, DD, MMM, etc.).',
            defaultValue: 'YYYY-MM-DD',
        },
    ],
    generate: (args) => formatDateTime(new Date(), args.format),
};

export const currentTimeDefinition: FnDefinition = {
    name: '_fn_current_time',
    description: 'Returns the current time in the requested format.',
    args: [
        {
            name: 'format',
            description: 'Time format tokens (HH, mm, ss, etc.).',
            defaultValue: 'HH:mm:ss',
        },
    ],
    generate: (args) => formatDateTime(new Date(), args.format),
};

export const randomDateDefinition: FnDefinition = {
    name: '_fn_random_date',
    description: 'Returns a random date between min and max.',
    args: [
        {
            name: 'min',
            description: 'Inclusive minimum date (ISO).',
            defaultValue: defaultMinDateString(),
            validate: (value) => (parseIsoDate(value) ? null : 'min must be a valid ISO date.'),
        },
        {
            name: 'max',
            description: 'Inclusive maximum date (ISO).',
            defaultValue: defaultMaxDateString(),
            validate: (value, args) => {
                const max = parseIsoDate(value);
                const min = parseIsoDate(args.min);
                if (!max) {
                    return 'max must be a valid ISO date.';
                }
                if (!min) {
                    return null;
                }
                if (min.getTime() > max.getTime()) {
                    return 'max must be greater than or equal to min.';
                }
                return null;
            },
        },
        {
            name: 'format',
            description: 'Output date format.',
            defaultValue: 'YYYY-MM-DD',
        },
    ],
    generate: (args) => {
        const min = parseIsoDate(args.min) ?? new Date(1970, 0, 1);
        const max = parseIsoDate(args.max) ?? new Date();
        const timestamp = randomInt(min.getTime(), max.getTime());
        return formatDateTime(new Date(timestamp), args.format);
    },
};

export const randomTimeDefinition: FnDefinition = {
    name: '_fn_random_time',
    description: 'Returns a random time between min and max.',
    args: [
        {
            name: 'min',
            description: 'Inclusive minimum time (HH:mm:ss).',
            defaultValue: '00:00:00',
            validate: (value) => (parseTimeToSeconds(value) !== null ? null : 'min must be a valid time.'),
        },
        {
            name: 'max',
            description: 'Inclusive maximum time (HH:mm:ss).',
            defaultValue: '23:59:59',
            validate: (value, args) => {
                const max = parseTimeToSeconds(value);
                const min = parseTimeToSeconds(args.min);
                if (max === null) {
                    return 'max must be a valid time.';
                }
                if (min === null) {
                    return null;
                }
                if (min > max) {
                    return 'max must be greater than or equal to min.';
                }
                return null;
            },
        },
        {
            name: 'format',
            description: 'Output time format.',
            defaultValue: 'HH:mm:ss',
        },
    ],
    generate: (args) => {
        const minSeconds = parseTimeToSeconds(args.min) ?? 0;
        const maxSeconds = parseTimeToSeconds(args.max) ?? 86399;
        const randomSeconds = randomInt(minSeconds, maxSeconds);
        const date = timeFromSeconds(randomSeconds);
        return formatDateTime(date, args.format);
    },
};

export function getDatetimeFunctionDefinitions(): FnDefinition[] {
    return [
        currentDateDefinition,
        currentTimeDefinition,
        randomDateDefinition,
        randomTimeDefinition,
    ];
}
