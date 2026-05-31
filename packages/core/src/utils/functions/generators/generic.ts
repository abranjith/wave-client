import type { FnDefinition } from '../types';
import {
    applyNumberFormat,
    expandCharsetDefinition,
    randomFloat,
    randomFromCharset,
    randomInt,
    randomUuid,
} from '../formatters';

function isFiniteNumber(value: string): boolean {
    const parsed = Number(value);
    return Number.isFinite(parsed);
}

function isIntegerString(value: string): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed);
}

export const randomUuidDefinition: FnDefinition = {
    name: '_fn_random_uuid',
    description: 'Generates a random UUID (v4).',
    args: [],
    generate: () => randomUuid(),
};

export const randomNumberDefinition: FnDefinition = {
    name: '_fn_random_number',
    description: 'Generates a random number with optional range and formatting.',
    args: [
        {
            name: 'min',
            description: 'Inclusive minimum numeric value.',
            defaultValue: '0',
            validate: (value) => (isFiniteNumber(value) ? null : 'min must be a number.'),
        },
        {
            name: 'max',
            description: 'Inclusive maximum numeric value.',
            defaultValue: '100',
            validate: (value, args) => {
                if (!isFiniteNumber(value)) {
                    return 'max must be a number.';
                }

                if (isFiniteNumber(args.min) && Number(args.min) > Number(value)) {
                    return 'max must be greater than or equal to min.';
                }

                return null;
            },
        },
        {
            name: 'decimals',
            description: 'Decimal precision for generated value.',
            defaultValue: '0',
            validate: (value) => {
                if (!isIntegerString(value)) {
                    return 'decimals must be an integer.';
                }
                if (Number(value) < 0) {
                    return 'decimals must be greater than or equal to 0.';
                }
                return null;
            },
        },
        {
            name: 'prefix',
            description: 'Text prepended to the number output.',
            defaultValue: '',
        },
        {
            name: 'suffix',
            description: 'Text appended to the number output.',
            defaultValue: '',
        },
    ],
    generate: (args) => {
        const min = Number(args.min);
        const max = Number(args.max);
        const decimals = Number(args.decimals);

        const value = decimals > 0
            ? randomFloat(min, max)
            : randomInt(min, max);

        return applyNumberFormat(value, decimals, args.prefix, args.suffix);
    },
};

export const randomStringDefinition: FnDefinition = {
    name: '_fn_random_string',
    description: 'Generates a random string from a charset pattern.',
    args: [
        {
            name: 'length',
            description: 'Length of the generated string.',
            defaultValue: '16',
            validate: (value) => {
                if (!isIntegerString(value)) {
                    return 'length must be an integer.';
                }
                if (Number(value) <= 0) {
                    return 'length must be greater than 0.';
                }
                return null;
            },
        },
        {
            name: 'charset',
            description: 'Charset definition using range tokens such as A-Za-z0-9.',
            defaultValue: 'A-Za-z0-9',
            validate: (value) => {
                const expanded = expandCharsetDefinition(value);
                return expanded.length === 0 ? 'charset must expand to at least one character.' : null;
            },
        },
    ],
    generate: (args) => {
        const length = Number(args.length);
        const charset = expandCharsetDefinition(args.charset);
        return randomFromCharset(length, charset);
    },
};

export function getGenericFunctionDefinitions(): FnDefinition[] {
    return [randomUuidDefinition, randomNumberDefinition, randomStringDefinition];
}
