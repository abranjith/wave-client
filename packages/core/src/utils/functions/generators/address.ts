import { getLocaleData } from '../../../data/fnData';
import { fillDigitPattern, pickRandom, randomInt } from '../formatters';
import type { FnDefinition } from '../types';

function randomAddressL1(): string {
    const localeData = getLocaleData();
    const houseNumber = randomInt(100, 9999);
    const streetName = pickRandom(localeData.streetNames);
    const streetType = pickRandom(localeData.streetTypes);
    return `${houseNumber} ${streetName} ${streetType}`;
}

function randomAddressL2(): string {
    const localeData = getLocaleData();
    const designator = pickRandom(localeData.secondaryUnitDesignators);
    const unitNumber = randomInt(1, 999);
    return `${designator} ${unitNumber}`;
}

function randomAddressCity(): string {
    return pickRandom(getLocaleData().cities);
}

function randomAddressCounty(): string {
    return pickRandom(getLocaleData().counties);
}

function randomAddressZip(): string {
    return fillDigitPattern('#####');
}

const randomAddressStateDefinition: FnDefinition = {
    name: '_fn_random_address_state',
    description: 'Generates a random US state.',
    args: [
        {
            name: 'format',
            description: 'State output format: abbr or full.',
            defaultValue: 'abbr',
            validate: (value) =>
                value === 'abbr' || value === 'full'
                    ? null
                    : 'format must be either abbr or full.',
        },
    ],
    generate: (args) => {
        const state = pickRandom(getLocaleData().states);
        return args.format === 'full' ? state.full : state.abbr;
    },
};

const randomAddressCountryDefinition: FnDefinition = {
    name: '_fn_random_address_country',
    description: 'Generates a random country.',
    args: [
        {
            name: 'format',
            description: 'Country output format: abbr or full.',
            defaultValue: 'abbr',
            validate: (value) =>
                value === 'abbr' || value === 'full'
                    ? null
                    : 'format must be either abbr or full.',
        },
    ],
    generate: (args) => {
        const country = pickRandom(getLocaleData().countries);
        return args.format === 'full' ? country.full : country.abbr;
    },
};

const randomAddressDefinition: FnDefinition = {
    name: '_fn_random_address',
    description: 'Generates a composed one-line address.',
    args: [],
    generate: () => {
        const state = pickRandom(getLocaleData().states).abbr;
        const country = pickRandom(getLocaleData().countries).abbr;
        return `${randomAddressL1()}, ${randomAddressCity()}, ${state} ${randomAddressZip()}, ${country}`;
    },
};

const randomAddressL1Definition: FnDefinition = {
    name: '_fn_random_address_l1',
    description: 'Generates address line 1.',
    args: [],
    generate: () => randomAddressL1(),
};

const randomAddressL2Definition: FnDefinition = {
    name: '_fn_random_address_l2',
    description: 'Generates address line 2 (unit/suite).',
    args: [],
    generate: () => randomAddressL2(),
};

const randomAddressCityDefinition: FnDefinition = {
    name: '_fn_random_address_city',
    description: 'Generates a random city.',
    args: [],
    generate: () => randomAddressCity(),
};

const randomAddressCountyDefinition: FnDefinition = {
    name: '_fn_random_address_county',
    description: 'Generates a random county.',
    args: [],
    generate: () => randomAddressCounty(),
};

const randomAddressZipDefinition: FnDefinition = {
    name: '_fn_random_address_zip',
    description: 'Generates a random 5-digit ZIP code.',
    args: [],
    generate: () => randomAddressZip(),
};

export function getAddressFunctionDefinitions(): FnDefinition[] {
    return [
        randomAddressDefinition,
        randomAddressL1Definition,
        randomAddressL2Definition,
        randomAddressCityDefinition,
        randomAddressStateDefinition,
        randomAddressCountyDefinition,
        randomAddressCountryDefinition,
        randomAddressZipDefinition,
    ];
}
