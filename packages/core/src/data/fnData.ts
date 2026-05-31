export interface LocaleData {
    firstNames: string[];
    lastNames: string[];
    orgNames: string[];
    namePrefixes: string[];
    nameSuffixes: string[];
    streetNames: string[];
    streetTypes: string[];
    secondaryUnitDesignators: string[];
    cities: string[];
    counties: string[];
    states: Array<{ full: string; abbr: string }>;
    countries: Array<{ full: string; abbr: string }>;
    emailDomains: string[];
}

const EN_US: LocaleData = {
    firstNames: [
        'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
        'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
        'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
        'Matthew', 'Betty', 'Anthony', 'Sandra', 'Mark', 'Ashley', 'Donald', 'Kimberly',
        'Steven', 'Emily', 'Paul', 'Donna', 'Andrew', 'Michelle', 'Joshua', 'Carol',
        'Kenneth', 'Amanda', 'Kevin', 'Melissa', 'Brian', 'Deborah', 'George', 'Stephanie',
        'Timothy', 'Rebecca',
    ],
    lastNames: [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
        'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
        'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
        'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
        'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
        'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
        'Carter', 'Roberts',
    ],
    orgNames: [
        'Northstar Labs', 'Crestline Systems', 'Blue Harbor Group', 'Summit Ridge Co',
        'Riverstone Partners', 'Ironwood Logistics', 'Aurora Analytics', 'Pioneer Dynamics',
        'Granite Peak Holdings', 'Cedar Valley Foods', 'Elm Street Media', 'Silverline Health',
        'Atlas Security', 'Brightfield Consulting', 'Maple Leaf Studios', 'Sunrise Energy',
        'Evergreen Ventures', 'Stonebridge Motors', 'Horizon Retail', 'Oakwood Manufacturing',
        'Clearwater Telecom', 'Redwood Financial', 'Skyline Biotech', 'MetroLink Transit',
    ],
    namePrefixes: ['Mr', 'Mrs', 'Ms', 'Mx', 'Dr', 'Prof'],
    nameSuffixes: ['Jr', 'Sr', 'II', 'III', 'IV', 'PhD', 'MD', 'Esq'],
    streetNames: [
        'Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake',
        'Hill', 'Sunset', 'Park', 'Ridge', 'River', 'Walnut', 'Highland', 'Forest',
        'Lincoln', 'Adams', 'Madison', 'Franklin', 'Jefferson', 'Jackson', 'Cherry', 'Meadow',
        'Willow', 'Sycamore', 'Center', 'Prospect', 'Broad', 'North', 'South', 'East',
        'West', 'College', 'Mill', 'State', 'Market', 'Bridge', 'Church', 'Spring',
    ],
    streetTypes: [
        'St', 'Ave', 'Blvd', 'Rd', 'Dr', 'Ln', 'Ct', 'Pl', 'Way', 'Pkwy',
        'Ter', 'Cir', 'Trl', 'Hwy', 'Sq',
    ],
    secondaryUnitDesignators: ['Apt', 'Suite', 'Unit', 'Floor', 'Bldg', 'Room', '#'],
    cities: [
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
        'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus',
        'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington',
        'Boston', 'El Paso', 'Nashville', 'Detroit', 'Portland', 'Las Vegas', 'Memphis',
        'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Mesa',
        'Sacramento', 'Atlanta', 'Kansas City', 'Colorado Springs', 'Miami', 'Raleigh',
    ],
    counties: [
        'Orange County', 'King County', 'Cook County', 'Harris County', 'Maricopa County',
        'Clark County', 'Bexar County', 'Travis County', 'Broward County', 'Wayne County',
        'Fulton County', 'Franklin County', 'Shelby County', 'Jefferson County', 'Fairfax County',
        'Alameda County', 'Middlesex County', 'Suffolk County', 'Wake County', 'Palm Beach County',
    ],
    states: [
        { full: 'Alabama', abbr: 'AL' }, { full: 'Alaska', abbr: 'AK' }, { full: 'Arizona', abbr: 'AZ' },
        { full: 'Arkansas', abbr: 'AR' }, { full: 'California', abbr: 'CA' }, { full: 'Colorado', abbr: 'CO' },
        { full: 'Connecticut', abbr: 'CT' }, { full: 'Delaware', abbr: 'DE' }, { full: 'Florida', abbr: 'FL' },
        { full: 'Georgia', abbr: 'GA' }, { full: 'Hawaii', abbr: 'HI' }, { full: 'Idaho', abbr: 'ID' },
        { full: 'Illinois', abbr: 'IL' }, { full: 'Indiana', abbr: 'IN' }, { full: 'Iowa', abbr: 'IA' },
        { full: 'Kansas', abbr: 'KS' }, { full: 'Kentucky', abbr: 'KY' }, { full: 'Louisiana', abbr: 'LA' },
        { full: 'Maine', abbr: 'ME' }, { full: 'Maryland', abbr: 'MD' }, { full: 'Massachusetts', abbr: 'MA' },
        { full: 'Michigan', abbr: 'MI' }, { full: 'Minnesota', abbr: 'MN' }, { full: 'Mississippi', abbr: 'MS' },
        { full: 'Missouri', abbr: 'MO' }, { full: 'Montana', abbr: 'MT' }, { full: 'Nebraska', abbr: 'NE' },
        { full: 'Nevada', abbr: 'NV' }, { full: 'New Hampshire', abbr: 'NH' }, { full: 'New Jersey', abbr: 'NJ' },
        { full: 'New Mexico', abbr: 'NM' }, { full: 'New York', abbr: 'NY' }, { full: 'North Carolina', abbr: 'NC' },
        { full: 'North Dakota', abbr: 'ND' }, { full: 'Ohio', abbr: 'OH' }, { full: 'Oklahoma', abbr: 'OK' },
        { full: 'Oregon', abbr: 'OR' }, { full: 'Pennsylvania', abbr: 'PA' }, { full: 'Rhode Island', abbr: 'RI' },
        { full: 'South Carolina', abbr: 'SC' }, { full: 'South Dakota', abbr: 'SD' }, { full: 'Tennessee', abbr: 'TN' },
        { full: 'Texas', abbr: 'TX' }, { full: 'Utah', abbr: 'UT' }, { full: 'Vermont', abbr: 'VT' },
        { full: 'Virginia', abbr: 'VA' }, { full: 'Washington', abbr: 'WA' }, { full: 'West Virginia', abbr: 'WV' },
        { full: 'Wisconsin', abbr: 'WI' }, { full: 'Wyoming', abbr: 'WY' },
    ],
    countries: [
        { full: 'United States', abbr: 'US' },
        { full: 'Canada', abbr: 'CA' },
        { full: 'Mexico', abbr: 'MX' },
        { full: 'United Kingdom', abbr: 'UK' },
        { full: 'Germany', abbr: 'DE' },
        { full: 'France', abbr: 'FR' },
        { full: 'Japan', abbr: 'JP' },
        { full: 'Australia', abbr: 'AU' },
        {full: 'India', abbr: 'IN' },
        { full: 'Brazil', abbr: 'BR' },
        { full: 'China', abbr: 'CN' }
    ],
    emailDomains: [
        'example.com', 'test.com', 'sample.org', 'demo.net', 'acme.io', 'mailinator.com',
        'corp.example', 'business.test', 'sandbox.dev', 'local.invalid',
    ],
};

/**
 * Returns locale-backed faker data. Defaults to en-US.
 */
export function getLocaleData(locale: string = 'en-US'): LocaleData {
    if (locale.toLowerCase() === 'en-us') {
        return EN_US;
    }

    return EN_US;
}
