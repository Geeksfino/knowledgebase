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
    if (req.method === 'POST' && url.pathname === '/search') {
      const body = await req.json() as { query: string; limit?: number };
      const query = body.query.toLowerCase();
      const limit = body.limit || 5;

      // Simple keyword matching (mock vector search)
      const results = documents
        .map(doc => {
          const text = doc.text.toLowerCase();
          // Calculate simple relevance score based on keyword overlap
          const queryWords = query.split(/\s+/);
          const matchCount = queryWords.filter(word => text.includes(word)).length;
          const score = matchCount / queryWords.length;
          return { id: doc.id, score, text: doc.text };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      console.log(`[mock-txtai] Search "${body.query}" -> ${results.length} results`);
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

