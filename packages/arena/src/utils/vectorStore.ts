/**
 * Vector Store
 * 
 * Local vector store for document embeddings using HNSWLib.
 */

// Note: This is a placeholder implementation.
// Full implementation will require HNSWLib setup which needs native dependencies.

// ============================================================================
// Types
// ============================================================================

export interface VectorStoreConfig {
  /** Dimension of embeddings (depends on model) */
  dimension?: number;
  /** Max elements in the index */
  maxElements?: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

// ============================================================================
// Vector Store Implementation
// ============================================================================

/**
 * Create a vector store instance
 * 
 * Note: This is a simple in-memory implementation for MVP.
 * Production implementation would use HNSWLib for efficient similarity search.
 */
export function createVectorStore(config: VectorStoreConfig = {}) {
  const {
    dimension = 768, // Default for many embedding models
    maxElements = 10000,
  } = config;

  // In-memory storage
  const chunks: Map<string, DocumentChunk> = new Map();

  /**
   * Compute cosine similarity between two vectors
   */
  const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  return {
    /**
     * Add a document chunk to the store
     */
    async add(chunk: DocumentChunk): Promise<void> {
      if (chunks.size >= maxElements) {
        // Remove oldest chunk (simple LRU-like behavior)
        const firstKey = chunks.keys().next().value;
        if (firstKey) {
          chunks.delete(firstKey);
        }
      }

      chunks.set(chunk.id, chunk);
    },

    /**
     * Add multiple chunks
     */
    async addBatch(chunkList: DocumentChunk[]): Promise<void> {
      for (const chunk of chunkList) {
        await this.add(chunk);
      }
    },

    /**
     * Remove a chunk by ID
     */
    async remove(chunkId: string): Promise<boolean> {
      return chunks.delete(chunkId);
    },

    /**
     * Remove all chunks for a document
     */
    async removeByDocument(documentId: string): Promise<number> {
      let removed = 0;
      
      for (const [id, chunk] of chunks.entries()) {
        if (chunk.documentId === documentId) {
          chunks.delete(id);
          removed++;
        }
      }
      
      return removed;
    },

    /**
     * Search for similar chunks
     */
    async search(queryEmbedding: number[], topK: number = 5): Promise<SearchResult[]> {
      const results: SearchResult[] = [];

      for (const chunk of chunks.values()) {
        if (chunk.embedding) {
          const score = cosineSimilarity(queryEmbedding, chunk.embedding);
          results.push({ chunk, score });
        }
      }

      // Sort by score descending and take top K
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },

    /**
     * Get a chunk by ID
     */
    get(chunkId: string): DocumentChunk | undefined {
      return chunks.get(chunkId);
    },

    /**
     * Get all chunks for a document
     */
    getByDocument(documentId: string): DocumentChunk[] {
      const result: DocumentChunk[] = [];
      
      for (const chunk of chunks.values()) {
        if (chunk.documentId === documentId) {
          result.push(chunk);
        }
      }
      
      return result;
    },

    /**
     * Get store stats
     */
    getStats(): { 
      totalChunks: number; 
      dimension: number; 
      maxElements: number;
      documents: number;
    } {
      const documentIds = new Set<string>();
      for (const chunk of chunks.values()) {
        documentIds.add(chunk.documentId);
      }
      
      return {
        totalChunks: chunks.size,
        dimension,
        maxElements,
        documents: documentIds.size,
      };
    },

    /**
     * Clear all data
     */
    clear(): void {
      chunks.clear();
    },

    /**
     * Export all chunks (for persistence)
     */
    export(): DocumentChunk[] {
      return Array.from(chunks.values());
    },

    /**
     * Import chunks (for restoration)
     */
    async import(chunkList: DocumentChunk[]): Promise<void> {
      chunks.clear();
      for (const chunk of chunkList) {
        chunks.set(chunk.id, chunk);
      }
    },
  };
}
