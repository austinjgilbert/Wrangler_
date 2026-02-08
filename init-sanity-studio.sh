#!/bin/bash

# Initialize Sanity Studio with schemas for Website Scanner Worker

set -e

echo "🎨 Initializing Sanity Studio"
echo "=============================="
echo ""

# Check if Sanity CLI is installed
if ! command -v sanity &> /dev/null; then
    echo "❌ Sanity CLI not found"
    echo "   Install with: npm install -g @sanity/cli"
    exit 1
fi

echo "✅ Sanity CLI found"
echo ""

# Get project ID from wrangler secrets
echo "📋 Getting Sanity project ID from Cloudflare secrets..."
PROJECT_ID=$(wrangler secret list 2>&1 | grep -A 1 "SANITY_PROJECT_ID" | grep -v "SANITY_PROJECT_ID" | head -1 | sed 's/.*"name": "SANITY_PROJECT_ID".*//' || echo "")

if [ -z "$PROJECT_ID" ]; then
    echo "⚠️  Could not auto-detect project ID"
    echo "   You'll need to enter it manually"
    read -p "Enter your Sanity Project ID: " PROJECT_ID
fi

echo ""
echo "📦 Initializing Studio..."
echo ""

# Create studio directory if it doesn't exist
STUDIO_DIR="sanity-studio"
if [ -d "$STUDIO_DIR" ]; then
    echo "⚠️  Directory $STUDIO_DIR already exists"
    read -p "Continue and overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    rm -rf "$STUDIO_DIR"
fi

mkdir -p "$STUDIO_DIR"
cd "$STUDIO_DIR"

# Initialize with clean template
echo "Running: sanity init --template clean"
echo ""

# Use non-interactive mode if possible
sanity init --template clean --project-id "$PROJECT_ID" --dataset production --output-path . --yes || {
    echo ""
    echo "⚠️  Interactive mode required"
    echo "   Please follow the prompts:"
    echo "   - Project ID: $PROJECT_ID (or your actual ID)"
    echo "   - Dataset: production"
    echo "   - Output path: . (current directory)"
    echo ""
    sanity init --template clean
}

echo ""
echo "✅ Studio initialized!"
echo ""

# Copy schemas
echo "📝 Adding schemas..."
cd ..

if [ -d "schemas" ]; then
    mkdir -p "$STUDIO_DIR/schemas"
    # Copy all schemas
    cp schemas/*.js "$STUDIO_DIR/schemas/" 2>/dev/null || true
    echo "✅ Copied all schemas"
    
    # List copied schemas
    SCHEMA_COUNT=$(ls -1 "$STUDIO_DIR/schemas"/*.js 2>/dev/null | wc -l || echo "0")
    echo "   Found $SCHEMA_COUNT schema files"
else
    echo "⚠️  schemas/ directory not found"
    echo "   Creating basic schemas..."
    mkdir -p "$STUDIO_DIR/schemas"
fi

# Update schemas/index.js
cd "$STUDIO_DIR"

# Core schemas (required)
CORE_SCHEMAS=("brief" "account" "person" "accountPack")
# Intelligence memory system schemas
MEMORY_SCHEMAS=("interaction" "session" "learning" "userInteraction" "learningFeedback")
# Optional schemas
OPTIONAL_SCHEMAS=("osint" "osintJob" "relationship" "userPattern" "usageLog")

ALL_SCHEMAS=("${CORE_SCHEMAS[@]}" "${MEMORY_SCHEMAS[@]}" "${OPTIONAL_SCHEMAS[@]}")

if [ -f "schemas/index.js" ]; then
    # Backup existing file
    cp schemas/index.js schemas/index.js.bak
    
    # Add imports for missing schemas
    for schema in "${ALL_SCHEMAS[@]}"; do
        if [ -f "schemas/${schema}.js" ] && ! grep -q "import.*${schema}" schemas/index.js; then
            # Add import at top
            sed -i.bak "1a\\
import ${schema} from './${schema}';\\
" schemas/index.js
            
            # Add to export array if not present
            if ! grep -q "\b${schema}\b" schemas/index.js; then
                sed -i.bak "s/export default \[/export default [\n    ${schema},/" schemas/index.js
            fi
            echo "✅ Added ${schema} to schemas/index.js"
        fi
    done
    
    # Clean up backup
    rm -f schemas/index.js.bak
else
    # Create schemas/index.js with all available schemas
    echo "📝 Creating schemas/index.js..."
    
    # Build list of available schemas
    SCHEMA_IMPORTS=""
    SCHEMA_EXPORTS=""
    
    # Core schemas (always include if files exist)
    for schema in brief account person accountPack; do
        if [ -f "schemas/${schema}.js" ]; then
            SCHEMA_IMPORTS="${SCHEMA_IMPORTS}import ${schema} from './${schema}';\n"
            SCHEMA_EXPORTS="${SCHEMA_EXPORTS}  ${schema},\n"
        fi
    done
    
    # Intelligence memory system schemas (new)
    SCHEMA_IMPORTS="${SCHEMA_IMPORTS}\n// Intelligence memory system\n"
    for schema in interaction session learning; do
        if [ -f "schemas/${schema}.js" ]; then
            SCHEMA_IMPORTS="${SCHEMA_IMPORTS}import ${schema} from './${schema}';\n"
            SCHEMA_EXPORTS="${SCHEMA_EXPORTS}  ${schema},\n"
        fi
    done
    
    # Optional schemas
    SCHEMA_IMPORTS="${SCHEMA_IMPORTS}\n// Optional schemas\n"
    for schema in osint osintJob relationship userPattern; do
        if [ -f "schemas/${schema}.js" ]; then
            SCHEMA_IMPORTS="${SCHEMA_IMPORTS}import ${schema} from './${schema}';\n"
            SCHEMA_EXPORTS="${SCHEMA_EXPORTS}  ${schema},\n"
        fi
    done
    
    # Create the file
    cat > schemas/index.js << EOF
${SCHEMA_IMPORTS}
export default [
${SCHEMA_EXPORTS}];
EOF
    echo "✅ Created schemas/index.js with available schemas"
fi

echo ""
echo "🎉 Sanity Studio setup complete!"
echo ""
echo "📊 Schemas included:"
echo "  ✅ Core: brief, account, person, accountPack"
echo "  ✅ Intelligence Memory: interaction, session, learning"
echo "  ✅ Optional: osint, osintJob, relationship, userPattern (if available)"
echo ""
echo "📋 Next steps:"
echo "  1. cd sanity-studio"
echo "  2. npm install (if needed)"
echo "  3. sanity deploy"
echo ""
echo "Or run locally:"
echo "  cd sanity-studio && npm run dev"
echo ""
echo "💡 The intelligence memory system schemas (interaction, session, learning)"
echo "   enable GPT to reference past conversations and learnings!"

