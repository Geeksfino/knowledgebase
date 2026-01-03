/**
 * Mock txtai Service for Testing
 * 
 * Simulates txtai API for local development without full txtai installation.
 * Uses simple keyword matching instead of vector search.
 */

interface Document {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

// In-memory document store
const documents: Document[] = [];

const server = Bun.serve({
  port: 8000,
  hostname: '0.0.0.0',

  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (req.method === 'GET' && url.pathname === '/') {
      return Response.json({ status: 'ok', service: 'mock-txtai' });
    }

    // Add documents
    if (req.method === 'POST' && url.pathname === '/add') {
      const body = await req.json() as Document[];
      for (const doc of body) {
        // Check if document exists, update or add
        const existingIndex = documents.findIndex(d => d.id === doc.id);
        if (existingIndex >= 0) {
          documents[existingIndex] = doc;
        } else {
          documents.push(doc);
        }
      }
      console.log(`[mock-txtai] Added ${body.length} documents, total: ${documents.length}`);
      return Response.json({ status: 'ok', count: documents.length });
    }

    // Rebuild index (no-op for mock)
    if (req.method === 'POST' && url.pathname === '/index') {
      console.log('[mock-txtai] Index rebuild requested (no-op)');
      return Response.json({ status: 'ok' });
    }

    // Search
    if (req.method === 'POST' && (url.pathname === '/search' || url.pathname === '/hybrid')) {
      const body = await req.json() as { query: string; limit?: number };
      const query = body.query.toLowerCase();
      const limit = body.limit || 5;
      const isHybrid = url.pathname === '/hybrid';

      // Improved search with semantic-like matching
      const results = documents
        .map(doc => {
          const text = doc.text.toLowerCase();
          const queryWords = query.split(/\s+/).filter(w => w.length > 0);
          
          // 1. Exact keyword matching (BM25-like)
          let keywordScore = 0;
          let exactMatchCount = 0;
          for (const word of queryWords) {
            if (text.includes(word)) {
              exactMatchCount++;
              // Count occurrences for better scoring
              const occurrences = (text.match(new RegExp(word, 'g')) || []).length;
              keywordScore += occurrences / queryWords.length;
            }
          }
          
          // 2. Semantic-like matching (simulating vector search)
          // Match related concepts/words with better Chinese support
          let semanticScore = 0;
          const semanticPairs: Record<string, string[]> = {
            '访问凭证': ['访问令牌', 'api 密钥', '密钥', 'token', '凭证', '认证', '授权'],
            'api 密钥': ['访问令牌', '访问凭证', '密钥', 'token', '认证', '授权'],
            '访问令牌': ['api 密钥', '访问凭证', 'token', '认证', '授权', '令牌'],
            '设置': ['配置', '建立', '创建', '安装', '输入', '填写'],
            '配置': ['设置', '建立', '创建', '安装', '输入', '填写'],
            '如何': ['怎么', '怎样', '方法', '步骤', '操作'],
            '凭证': ['令牌', '密钥', 'token', '认证', '授权'],
            '令牌': ['凭证', '密钥', 'token', '认证', '授权'],
          };
          
          // Check for semantic matches - improved logic
          for (const [key, synonyms] of Object.entries(semanticPairs)) {
            if (query.includes(key)) {
              for (const synonym of synonyms) {
                if (text.includes(synonym)) {
                  semanticScore += 0.4; // Increased weight
                  break;
                }
              }
            }
          }
          
          // Additional: check if query and text share common concepts
          // Extract key concepts from query
          const queryConcepts = queryWords.filter(w => w.length >= 2);
          const textWords = text.split(/\s+/);
          let conceptMatches = 0;
          for (const concept of queryConcepts) {
            // Check if any text word is similar or related
            for (const textWord of textWords) {
              if (textWord.includes(concept) || concept.includes(textWord)) {
                conceptMatches++;
                break;
              }
            }
          }
          if (conceptMatches > 0) {
            semanticScore += (conceptMatches / queryConcepts.length) * 0.3;
          }
          
          // 3. Partial word matching (for better recall)
          let partialScore = 0;
          for (const word of queryWords) {
            if (word.length >= 2) {
              // Check if any word in text contains this substring
              const textWords = text.split(/\s+/);
              for (const textWord of textWords) {
                if (textWord.includes(word) || word.includes(textWord)) {
                  partialScore += 0.1;
                  break;
                }
              }
            }
          }
          
          // Combine scores
          let finalScore = 0;
          if (isHybrid) {
            // Hybrid: combine keyword (BM25-like) and semantic (vector-like)
            // More balanced weighting for hybrid
            finalScore = (keywordScore * 0.5) + (semanticScore * 0.4) + (partialScore * 0.1);
            // Boost for exact phrase match
            if (text.includes(query)) {
              finalScore = Math.min(finalScore * 1.5, 1.0);
            }
          } else {
            // Vector search: more weight on semantic
            finalScore = (keywordScore * 0.3) + (semanticScore * 0.6) + (partialScore * 0.1);
          }
          
          // Lower threshold: allow semantic matches even without exact keywords
          // Only filter out if there's absolutely no match
          if (exactMatchCount === 0 && semanticScore === 0 && partialScore === 0) {
            finalScore = 0;
          }
          
          // Ensure minimum score for any meaningful match
          if (finalScore > 0 && finalScore < 0.2) {
            finalScore = 0.2; // Boost low scores to pass minScore threshold
          }
          
          return { id: doc.id, score: Math.min(finalScore, 1.0), text: doc.text };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      console.log(`[mock-txtai] ${isHybrid ? 'Hybrid' : 'Vector'} Search "${body.query}" -> ${results.length} results`);
      return Response.json(results);
    }

    // Delete documents
    if (req.method === 'POST' && url.pathname === '/delete') {
      const ids = await req.json() as string[];
      for (const id of ids) {
        const index = documents.findIndex(d => d.id === id);
        if (index >= 0) {
          documents.splice(index, 1);
        }
      }
      console.log(`[mock-txtai] Deleted ${ids.length} documents`);
      return Response.json({ status: 'ok' });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log('🔍 Mock txtai service running on http://localhost:8000');
console.log('   This is a simplified mock for testing - uses keyword matching');

