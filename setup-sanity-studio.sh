#!/bin/bash

# Setup Sanity Studio for Website Scanner Worker

set -e

echo "🎨 Sanity Studio Setup"
echo "====================="
echo ""

# Check if Sanity CLI is installed
if ! command -v sanity &> /dev/null; then
    echo "❌ Sanity CLI not found"
    echo "   Install with: npm install -g @sanity/cli"
    exit 1
fi

echo "✅ Sanity CLI found"
echo ""

# Check if Studio already exists
if [ -f "sanity.json" ] || [ -f "sanity.config.js" ] || [ -f "sanity.config.ts" ]; then
    echo "⚠️  Sanity Studio already exists in this directory"
    echo "   Skipping initialization..."
    echo ""
    echo "📝 To add new schemas (interaction, session, learning, etc.):"
    echo "   1. Copy schemas/*.js to your Studio's schemas directory"
    echo "   2. Import them in schemas/index.js"
    echo "   3. Run: sanity deploy"
    echo ""
    echo "   Or run: ./init-sanity-studio.sh to auto-setup all schemas"
    exit 0
fi

echo "📦 Initializing Sanity Studio..."
echo ""

# Initialize Studio in a subdirectory
STUDIO_DIR="sanity-studio"

if [ -d "$STUDIO_DIR" ]; then
    echo "⚠️  Directory $STUDIO_DIR already exists"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    mkdir -p "$STUDIO_DIR"
fi

cd "$STUDIO_DIR"

# Initialize Sanity project
echo "Running: sanity init --project-id (will prompt for details)"
echo ""
sanity init --template clean --project-id

echo ""
echo "✅ Sanity Studio initialized!"
echo ""
echo "📝 Next steps:"
echo "   1. Copy schemas from ../schemas/ to schemas/"
echo "   2. Import them in schemas/index.js"
echo "   3. Run: sanity deploy"
echo ""
echo "Or run: ./setup-schemas.sh (if it exists)"

