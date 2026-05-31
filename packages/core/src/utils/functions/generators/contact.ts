import { getLocaleData } from '../../../data/fnData';
import { fillDigitPattern, pickRandom, randomInt } from '../formatters';
import type { FnDefinition } from '../types';

function buildEmailLocalPart(): string {
    const localeData = getLocaleData();
    const first = pickRandom(localeData.firstNames).toLowerCase().replace(/[^a-z0-9]/g, '');
    const last = pickRandom(localeData.lastNames).toLowerCase().replace(/[^a-z0-9]/g, '');
    const suffix = randomInt(10, 9999);
    return `${first}.${last}${suffix}`;
}

const randomEmailDefinition: FnDefinition = {
    name: '_fn_random_email',
    description: 'Generates a random email address.',
    args: [
        {
            name: 'domain',
            description: 'Optional domain override.',
            defaultValue: '',
        },
    ],
    generate: (args) => {
        const localeData = getLocaleData();
        const domain = args.domain || pickRandom(localeData.emailDomains);
        return `${buildEmailLocalPart()}@${domain.toLowerCase()}`;
    },
};

const randomPhoneDefinition: FnDefinition = {
    name: '_fn_random_phone',
    description: 'Generates a random phone number using # placeholders.',
    args: [
        {
            name: 'format',
            description: 'Phone format pattern where # is replaced by a digit.',
            defaultValue: '(###) ###-####',
        },
    ],
    generate: (args) => fillDigitPattern(args.format),
};

const randomSsnDefinition: FnDefinition = {
    name: '_fn_random_ssn',
    description: 'Generates a random SSN using # placeholders.',
    args: [
        {
            name: 'format',
            description: 'SSN format pattern where # is replaced by a digit.',
            defaultValue: '###-##-####',
        },
    ],
    generate: (args) => fillDigitPattern(args.format),
};

export function getContactFunctionDefinitions(): FnDefinition[] {
    return [randomEmailDefinition, randomPhoneDefinition, randomSsnDefinition];
}
