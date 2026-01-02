#!/bin/bash
# Generate TypeScript types from OpenAPI contracts

echo "📝 Generating contract types..."

# Check if openapi-typescript is installed
if ! command -v openapi-typescript &> /dev/null; then
    echo "⚠️  openapi-typescript not found. Installing..."
    npm install -g openapi-typescript
fi

# Create output directories
mkdir -p libs/contracts-ts/generated

# Ensure libs/contracts-ts is a valid workspace package
if [ ! -f "libs/contracts-ts/package.json" ]; then
  echo "⚙️  Creating libs/contracts-ts/package.json (workspace package metadata)..."
  cat > libs/contracts-ts/package.json <<'EOF'
{
  "name": "@knowledgebase/contracts-ts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "index.ts",
  "exports": {
    ".": "./index.ts",
    "./generated/*": "./generated/*"
  }
}
EOF
fi

# Generate TypeScript types
echo "Generating TypeScript types..."
for yaml_file in contracts/**/*.yaml; do
    if [ -f "$yaml_file" ]; then
        output_file=$(echo "$yaml_file" | sed 's/contracts\//libs\/contracts-ts\/generated\//' | sed 's/\.yaml$/.ts/')
        mkdir -p "$(dirname "$output_file")"
        openapi-typescript "$yaml_file" -o "$output_file"
        echo "  ✅ $yaml_file -> $output_file"
    fi
done

echo "✅ Contract generation complete!"

