/**
 * Wave Schemas
 *
 * Formal, versioned Zod schemas for the persisted Wave file formats
 * (collections and environments). Canonical reference: `docs/schemas.md`.
 */

export {
    CURRENT_COLLECTION_SCHEMA_VERSION,
    WaveCollectionSchema,
    validateWaveCollection,
} from './collectionSchema';

export {
    CURRENT_ENVIRONMENT_SCHEMA_VERSION,
    WaveEnvironmentSchema,
    validateWaveEnvironment,
} from './environmentSchema';
