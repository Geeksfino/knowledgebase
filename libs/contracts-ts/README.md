# TypeScript Contracts Package

This package contains auto-generated TypeScript types from OpenAPI contracts.

## Structure

```
libs/contracts-ts/
├── package.json       # Workspace package definition (COMMIT)
├── index.ts           # Main export file (COMMIT)
├── README.md          # This file (COMMIT)
└── generated/         # Auto-generated types (DO NOT COMMIT)
    └── knowledge-provider.ts
```

## What to Commit

✅ **DO COMMIT:**
- `package.json` - Workspace package metadata
- `index.ts` - Main export file
- `README.md` - Documentation

❌ **DO NOT COMMIT:**
- `generated/` - Auto-generated from `contracts/*.yaml`

The `generated/` folder is in `.gitignore` because types are generated from OpenAPI contracts.

## How It Works

1. **Source**: OpenAPI contracts in `contracts/` directory
2. **Generate**: Run `npm run generate-contracts` or `./scripts/generate-contracts.sh`
3. **Output**: TypeScript types in `generated/`
4. **Use**: Import in services

## Usage

```typescript
// Import from generated types
import type { components } from '../../libs/contracts-ts/generated/knowledge-provider.js';

// Use the types
type ProviderSearchRequest = components['schemas']['ProviderSearchRequest'];
type ProviderSearchResponse = components['schemas']['ProviderSearchResponse'];
```

## Generation

From workspace root:

```bash
# Generate TypeScript types from OpenAPI contracts
npm run generate-contracts
# or
./scripts/generate-contracts.sh
```

This will:
1. Find all `contracts/**/*.yaml` files
2. Run `openapi-typescript` on each
3. Output to `libs/contracts-ts/generated/`

## When to Regenerate

Run generation script whenever:
- OpenAPI contracts are modified
- New contracts are added
- After pulling contract changes from git
- Before building services

