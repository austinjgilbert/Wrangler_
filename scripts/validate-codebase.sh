#!/bin/bash
# Comprehensive codebase validation

set -e

echo "=== Codebase Validation ==="
echo ""

ERRORS=0
WARNINGS=0

# Check syntax of all JS files
echo "1. Checking JavaScript syntax..."
for file in $(find src -name "*.js" -type f); do
  if ! node -c "$file" 2>/dev/null; then
    echo "❌ Syntax error in: $file"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✅ All JavaScript files have valid syntax"
else
  echo "❌ Found $ERRORS syntax errors"
fi

# Check for common issues
echo ""
echo "2. Checking for common issues..."

# Check for undefined imports
echo "   - Checking import statements..."
MISSING_IMPORTS=0
for file in $(find src -name "*.js" -type f); do
  if grep -q "import.*from.*undefined" "$file" 2>/dev/null; then
    echo "   ⚠️  Potential undefined import in: $file"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# Check for export consistency
echo "   - Checking exports..."
for file in $(find src/services src/handlers -name "*.js" -type f 2>/dev/null); do
  if ! grep -q "^export" "$file" && ! grep -q "export default" "$file"; then
    echo "   ⚠️  No exports found in: $file (might be intentional)"
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo ""
echo "=== Summary ==="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"

if [ $ERRORS -eq 0 ]; then
  echo "✅ Codebase validation passed"
  exit 0
else
  echo "❌ Codebase validation failed"
  exit 1
fi

