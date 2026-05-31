# Dynamic Function Variables

Wave Client supports dynamic placeholder functions using the reserved `_fn_` prefix.

These placeholders reuse the existing `{{...}}` syntax used for environment variables,
but evaluate values at request-build time.

Examples:

- `{{_fn_random_uuid}}`
- `{{_fn_random_number(min=1, max=100)}}`
- `{{_fn_current_date(format=YYYY-MM-DD)}}`

## Rules

- `_fn_` is reserved. Placeholders starting with `_fn_` are always treated as functions.
- Function placeholders are evaluated per occurrence (no caching).
- Named argument syntax: `_fn_name(key=value, key=value)`.
- Argument values must not contain the parser delimiters: `,`, `(`, `)`, `}`.
- Unknown functions or invalid arguments remain unresolved and are reported through the existing unresolved placeholder flow.

## Public API

```ts
import {
  isFunctionPlaceholder,
  resolveFunctionPlaceholder,
  validateFunctionTemplate,
} from '@wave-client/core';

const result = resolveFunctionPlaceholder('_fn_random_uuid');
// { resolved: '3f0e8...' } or null

const errors = validateFunctionTemplate(
  'id={{_fn_random_uuid}} invalid={{_fn_random_number(min=foo)}}'
);
// structured FnValidationError[]
```

## Built-in Function Reference

### Generic

| Function | Arguments | Description | Example |
| --- | --- | --- | --- |
| `_fn_random_uuid` | none | Random UUID v4. | `{{_fn_random_uuid}}` |
| `_fn_random_number` | `min=0`, `max=100`, `decimals=0`, `prefix=`, `suffix=` | Random number with optional formatting. | `{{_fn_random_number(min=1, max=100, decimals=2, prefix=$, suffix=%)}}` |
| `_fn_random_string` | `length=16`, `charset=A-Za-z0-9` | Random string from charset/ranges. | `{{_fn_random_string(length=10, charset=A-Z0-9)}}` |

### Date/Time

| Function | Arguments | Description | Example |
| --- | --- | --- | --- |
| `_fn_current_date` | `format=YYYY-MM-DD` | Current date. | `{{_fn_current_date(format=YYYY-MM-DD)}}` |
| `_fn_current_time` | `format=HH:mm:ss` | Current time. | `{{_fn_current_time(format=HH:mm:ss)}}` |
| `_fn_random_date` | `min=<~50y ago>`, `max=<today>`, `format=YYYY-MM-DD` | Random date in range. | `{{_fn_random_date(min=2020-01-01, max=2020-12-31)}}` |
| `_fn_random_time` | `min=00:00:00`, `max=23:59:59`, `format=HH:mm:ss` | Random time in range. | `{{_fn_random_time(min=08:00:00, max=17:00:00)}}` |

### Person

| Function | Arguments | Description | Example |
| --- | --- | --- | --- |
| `_fn_random_name` | `type=person`, `parts=2` | Random person/org name. | `{{_fn_random_name(type=person, parts=3)}}` |
| `_fn_random_name_prefix` | `values=` | Prefix from locale pool or `|` override list. | `{{_fn_random_name_prefix(values=Dr|Prof)}}` |
| `_fn_random_name_suffix` | `values=` | Suffix from locale pool or `|` override list. | `{{_fn_random_name_suffix(values=Jr|III)}}` |

### Address

| Function | Arguments | Description | Example |
| --- | --- | --- | --- |
| `_fn_random_address` | none | One-line address: `l1, city, STATE zip, COUNTRY`. | `{{_fn_random_address}}` |
| `_fn_random_address_l1` | none | Address line 1. | `{{_fn_random_address_l1}}` |
| `_fn_random_address_l2` | none | Address line 2 (unit/suite). | `{{_fn_random_address_l2}}` |
| `_fn_random_address_city` | none | City. | `{{_fn_random_address_city}}` |
| `_fn_random_address_state` | `format=abbr` (`abbr\|full`) | State value in requested format. | `{{_fn_random_address_state(format=full)}}` |
| `_fn_random_address_county` | none | County. | `{{_fn_random_address_county}}` |
| `_fn_random_address_country` | `format=abbr` (`abbr\|full`) | Country value in requested format. | `{{_fn_random_address_country(format=full)}}` |
| `_fn_random_address_zip` | none | 5-digit ZIP. | `{{_fn_random_address_zip}}` |

### Contact

| Function | Arguments | Description | Example |
| --- | --- | --- | --- |
| `_fn_random_email` | `domain=` | Random email. Uses locale domains when omitted. | `{{_fn_random_email(domain=example.com)}}` |
| `_fn_random_phone` | `format=(###) ###-####` | Replaces `#` with random digits. | `{{_fn_random_phone(format=+1-###-###-####)}}` |
| `_fn_random_ssn` | `format=###-##-####` | Replaces `#` with random digits. | `{{_fn_random_ssn}}` |

## Date/Time Tokens

| Token | Meaning | Example |
| --- | --- | --- |
| `YYYY` | 4-digit year | `2026` |
| `YY` | 2-digit year | `26` |
| `MMM` | Month abbreviation | `May` |
| `MM` | Zero-padded month | `05` |
| `M` | Month | `5` |
| `DD` | Zero-padded day | `09` |
| `D` | Day | `9` |
| `HH` | Zero-padded hour (24h) | `07` |
| `H` | Hour (24h) | `7` |
| `mm` | Zero-padded minute | `03` |
| `m` | Minute | `3` |
| `ss` | Zero-padded second | `08` |
| `s` | Second | `8` |

## Extensibility

Built-ins are declared through a registry (`registerFunction`) plus per-function argument schemas.
Locale data is isolated in `packages/core/src/data/fnData.ts` (`getLocaleData`) so additional locales can be added without rewriting generators.
