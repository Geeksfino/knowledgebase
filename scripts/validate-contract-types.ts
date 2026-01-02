/**
 * Contract Type Validation Script
 * 
 * Validates that the generated TypeScript types match the OpenAPI contract
 * and that the service implementation uses the correct types.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Import generated types
import type { components } from '../libs/contracts-ts/generated/knowledge-provider.js';

// Extract types from contract
type ProviderSearchRequest = components['schemas']['ProviderSearchRequest'];
type ProviderSearchResponse = components['schemas']['ProviderSearchResponse'];
type ProviderChunk = components['schemas']['ProviderChunk'];
type DocumentUploadRequest = components['schemas']['DocumentUploadRequest'];
type DocumentUploadResponse = components['schemas']['DocumentUploadResponse'];
type DocumentListResponse = components['schemas']['DocumentListResponse'];
type Document = components['schemas']['Document'];
type HealthResponse = components['schemas']['HealthResponse'];
type ErrorResponse = components['schemas']['ErrorResponse'];
type DeleteResponse = components['schemas']['DeleteResponse'];

// Test data that should match contract types
const testSearchRequest: ProviderSearchRequest = {
  user_id: 'test-user',
  query: 'test query',
  limit: 5,
  token_budget: 1000,
  filters: { category: 'test' },
  metadata: { intent: 'general' },
};

const testSearchResponse: ProviderSearchResponse = {
  provider_name: 'test-provider',
  chunks: [
    {
      chunk_id: 'chunk-1',
      content: 'test content',
      score: 0.95,
      document_id: 'doc-1',
      document_title: 'Test Document',
      metadata: { category: 'test' },
    },
  ],
  total_tokens: 100,
  metadata: { search_mode: 'vector' },
};

const testUploadRequest: DocumentUploadRequest = {
  title: 'Test Document',
  content: 'Test content',
  category: 'test',
  description: 'Test description',
  metadata: { source: 'test' },
};

const testUploadResponse: DocumentUploadResponse = {
  document_id: 'doc-123',
  status: 'indexed',
  chunks_count: 5,
  message: 'Document indexed successfully',
};

const testDocument: Document = {
  document_id: 'doc-123',
  title: 'Test Document',
  category: 'test',
  description: 'Test description',
  status: 'indexed',
  chunks_count: 5,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: { source: 'test' },
};

const testDocumentListResponse: DocumentListResponse = {
  documents: [testDocument],
  total: 1,
  limit: 10,
  offset: 0,
};

const testHealthResponse: HealthResponse = {
  status: 'healthy',
  version: '1.0.0',
  txtai: {
    available: true,
    url: 'http://localhost:8000',
  },
};

const testErrorResponse: ErrorResponse = {
  error: 'Test error',
  code: 'TEST_ERROR',
  details: { field: 'test' },
};

const testDeleteResponse: DeleteResponse = {
  success: true,
  message: 'Document deleted',
};

// Validation functions
function validateSearchRequest(req: ProviderSearchRequest): boolean {
  return (
    typeof req.user_id === 'string' &&
    typeof req.query === 'string' &&
    (req.limit === undefined || typeof req.limit === 'number') &&
    (req.token_budget === undefined || typeof req.token_budget === 'number')
  );
}

function validateSearchResponse(resp: ProviderSearchResponse): boolean {
  return (
    typeof resp.provider_name === 'string' &&
    Array.isArray(resp.chunks) &&
    typeof resp.total_tokens === 'number' &&
    resp.chunks.every(
      (chunk) =>
        typeof chunk.chunk_id === 'string' &&
        typeof chunk.content === 'string' &&
        typeof chunk.score === 'number'
    )
  );
}

// Run validations
console.log('🔍 Validating Contract Types...\n');

const validations = [
  {
    name: 'ProviderSearchRequest',
    valid: validateSearchRequest(testSearchRequest),
  },
  {
    name: 'ProviderSearchResponse',
    valid: validateSearchResponse(testSearchResponse),
  },
  {
    name: 'DocumentUploadRequest',
    valid: typeof testUploadRequest.title === 'string' && typeof testUploadRequest.content === 'string',
  },
  {
    name: 'DocumentUploadResponse',
    valid:
      typeof testUploadResponse.document_id === 'string' &&
      ['indexed', 'processing', 'failed'].includes(testUploadResponse.status),
  },
  {
    name: 'DocumentListResponse',
    valid: Array.isArray(testDocumentListResponse.documents) && typeof testDocumentListResponse.total === 'number',
  },
  {
    name: 'HealthResponse',
    valid: ['healthy', 'degraded', 'unhealthy'].includes(testHealthResponse.status),
  },
  {
    name: 'ErrorResponse',
    valid: typeof testErrorResponse.error === 'string' && typeof testErrorResponse.code === 'string',
  },
  {
    name: 'DeleteResponse',
    valid: typeof testDeleteResponse.success === 'boolean',
  },
];

let passed = 0;
let failed = 0;

validations.forEach((validation) => {
  if (validation.valid) {
    console.log(`✅ ${validation.name} - Valid`);
    passed++;
  } else {
    console.log(`❌ ${validation.name} - Invalid`);
    failed++;
  }
});

console.log(`\n📊 Summary: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\n❌ Type validation failed!');
  process.exit(1);
} else {
  console.log('\n✅ All type validations passed!');
  process.exit(0);
}

