import { getLocaleData } from '../../../data/fnData';
import { pickRandom } from '../formatters';
import type { FnDefinition } from '../types';

function isIntegerString(value: string): boolean {
    const parsed = Number(value);
    return Number.isInteger(parsed);
}

function parseOverrideValues(values: string): string[] {
    return values
        .split('|')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export const randomNameDefinition: FnDefinition = {
    name: '_fn_random_name',
    description: 'Generates a random person or organization name.',
    args: [
        {
            name: 'type',
            description: 'Name type: person or org.',
            defaultValue: 'person',
            validate: (value) => (
                value === 'person' || value === 'org'
                    ? null
                    : 'type must be either person or org.'
            ),
        },
        {
            name: 'parts',
            description: 'Number of tokens for person names.',
            defaultValue: '2',
            validate: (value) => {
                if (!isIntegerString(value)) {
                    return 'parts must be an integer.';
                }
                if (Number(value) <= 0) {
                    return 'parts must be greater than 0.';
                }
                return null;
            },
        },
    ],
    generate: (args) => {
        const localeData = getLocaleData();

        if (args.type === 'org') {
            return pickRandom(localeData.orgNames);
        }

        const parts = Number(args.parts);
        if (parts === 1) {
            return pickRandom(localeData.firstNames);
        }

        const tokens: string[] = [pickRandom(localeData.firstNames)];

        if (parts > 2) {
            for (let index = 0; index < parts - 2; index += 1) {
                tokens.push(pickRandom(localeData.firstNames));
            }
        }

        tokens.push(pickRandom(localeData.lastNames));
        return tokens.join(' ');
    },
};

export const randomNamePrefixDefinition: FnDefinition = {
    name: '_fn_random_name_prefix',
    description: 'Generates a random name prefix.',
    args: [
        {
            name: 'values',
            description: 'Optional override list separated by |.',
            defaultValue: '',
        },
    ],
    generate: (args) => {
        const localeData = getLocaleData();
        const overrideValues = parseOverrideValues(args.values);
        const pool = overrideValues.length > 0 ? overrideValues : localeData.namePrefixes;
        return pickRandom(pool);
    },
};

export const randomNameSuffixDefinition: FnDefinition = {
    name: '_fn_random_name_suffix',
    description: 'Generates a random name suffix.',
    args: [
        {
            name: 'values',
            description: 'Optional override list separated by |.',
            defaultValue: '',
        },
    ],
    generate: (args) => {
        const localeData = getLocaleData();
        const overrideValues = parseOverrideValues(args.values);
        const pool = overrideValues.length > 0 ? overrideValues : localeData.nameSuffixes;
        return pickRandom(pool);
    },
};

export function getPersonFunctionDefinitions(): FnDefinition[] {
    return [
        randomNameDefinition,
        randomNamePrefixDefinition,
        randomNameSuffixDefinition,
    ];
}
