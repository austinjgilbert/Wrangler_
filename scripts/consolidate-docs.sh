#!/bin/bash

# Consolidate Documentation Script
# Moves redundant documentation files to archive

set -e

ARCHIVE_DIR="docs/archive"
mkdir -p "$ARCHIVE_DIR"

echo "📚 Consolidating Documentation"
echo "=============================="
echo ""

# Archive summary/verification files
echo "Archiving summary files..."
mv -f *-SUMMARY.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f *-VERIFICATION.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f STEP*-*.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive test files
echo "Archiving test documentation..."
mv -f TEST-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f *-TEST*.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive fix/update files
echo "Archiving fix/update files..."
mv -f FIX-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f UPDATE-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f QUICK-*.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive how-to files
echo "Archiving how-to files..."
mv -f HOW-TO-*.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive checklist files
echo "Archiving checklist files..."
mv -f *-CHECKLIST.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive guide files (keep main ones)
echo "Archiving redundant guide files..."
mv -f GPT-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f LINKEDIN-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f SANITY-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f DEPLOYMENT-CHECKLIST.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f SETUP-WALKTHROUGH.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive status files
echo "Archiving status files..."
mv -f *-STATUS.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f CURRENT-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f READY-TO-*.md "$ARCHIVE_DIR/" 2>/dev/null || true

# Archive other redundant files
echo "Archiving other redundant files..."
mv -f ACTION-PLAN.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f NEXT-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f FINAL-*.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f MAKE-IT-WORK.md "$ARCHIVE_DIR/" 2>/dev/null || true
mv -f RESTART-GUIDE.md "$ARCHIVE_DIR/" 2>/dev/null || true

echo ""
echo "✅ Documentation consolidated!"
echo ""
echo "Archived files moved to: $ARCHIVE_DIR"
echo ""
echo "Keeping essential files:"
echo "  - README.md"
echo "  - gpt-instructions.md"
echo "  - openapi.yaml"
echo "  - wrangler.toml"
echo "  - package.json"
echo "  - CODE-EFFICIENCY-REPORT.md"
echo "  - OPTIMIZATION-PATCH.md"
echo "  - CONSOLIDATION-PLAN.md"

