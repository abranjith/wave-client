/**
 * useArenaModels Hook
 *
 * Fetches available models for a given provider from the platform adapter.
 * Results are cached per-provider within the hook's lifetime to avoid
 * duplicate network calls when switching between providers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useArenaAdapter } from './useAdapter';
import type { DynamicModelInfo, ArenaProviderType } from '../config/arenaConfig';

export interface UseArenaModelsResult {
  /** The fetched models (empty while loading or on error). */
  models: DynamicModelInfo[];
  /** True while a fetch is in progress. */
  isLoading: boolean;
  /** Error message from the most recent failed fetch; null on success. */
  error: string | null;
  /** Manually re-trigger the fetch for the current provider. */
  refetch: () => void;
}

/**
 * Fetches models for the given `provider` via the platform adapter.
 *
 * On mount and whenever `provider` changes the hook automatically fetches.
 * Results are cached in `modelCache` (a ref) so switching back to a previously
 * fetched provider is instant.
 *
 * @param provider The arena provider to fetch models for.
 * @returns `{ models, isLoading, error, refetch }`
 */
export function useArenaModels(provider: ArenaProviderType): UseArenaModelsResult {
  const arenaAdapter = useArenaAdapter();

  // Per-instance cache: provider → DynamicModelInfo[]
  const modelCache = useRef<Partial<Record<ArenaProviderType, DynamicModelInfo[]>>>({});

  const [models, setModels] = useState<DynamicModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch models for the given provider; uses cached values when available.
  const fetchModels = useCallback(
    async (targetProvider: ArenaProviderType, bustCache = false) => {
      if (!bustCache && modelCache.current[targetProvider] !== undefined) {
        setModels(modelCache.current[targetProvider]!);
        setError(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      const result = await arenaAdapter.getAvailableModels(targetProvider);
      if (result.isOk) {
        modelCache.current[targetProvider] = result.value;
        setModels(result.value);
        setError(null);
      } else {
        setModels([]);
        setError(result.error);
      }
      setIsLoading(false);
    },
    [arenaAdapter],
  );

  // Re-fetch whenever the provider changes.
  useEffect(() => {
    fetchModels(provider);
  }, [provider, fetchModels]);

  const refetch = useCallback(() => {
    fetchModels(provider, true);
  }, [provider, fetchModels]);

  return { models, isLoading, error, refetch };
}
