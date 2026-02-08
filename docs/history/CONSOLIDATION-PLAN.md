# Code Consolidation Plan

## Overview
Transform the monolithic 8,160-line `index.js` into a modular, production-ready architecture.

## Architecture

```
src/
├── index.js              # Main entry point (router only)
├── config/
│   └── constants.js      # ✅ Created - App constants & limits
├── utils/
│   ├── headers.js        # ✅ Created - Header generation
│   ├── validation.js     # ✅ Created - URL validation
│   ├── http.js           # ✅ Created - Fetch utilities
│   ├── response.js        # ✅ Created - Response helpers
│   ├── cache.js          # ✅ Created - Cache interface
│   └── text.js           # ✅ Created - Text processing
├── services/
│   ├── scanner.js         # Website scanning logic
│   ├── detector.js       # Tech stack detection
│   ├── analyzer.js       # Business analysis
│   ├── sanity.js         # Sanity CMS integration
│   ├── linkedin.js       # LinkedIn scraping
│   └── search.js         # Web search provider
├── handlers/
│   ├── scan.js           # /scan endpoint
│   ├── batch.js          # /scan-batch endpoint
│   ├── extract.js         # /extract endpoint
│   ├── search.js          # /search endpoint
│   ├── discover.js       # /discover endpoint
│   ├── crawl.js          # /crawl endpoint
│   ├── brief.js          # /brief endpoint
│   ├── verify.js         # /verify endpoint
│   ├── linkedin.js       # /linkedin-profile endpoint
│   ├── sanity.js         # /store, /query, /update, /delete
│   └── cache.js          # /cache/status endpoint
└── types/
    └── index.js          # TypeScript/JSDoc type definitions

docs/
├── README.md             # Main documentation
├── api/
│   ├── endpoints.md      # API reference
│   └── examples.md      # Usage examples
├── deployment/
│   ├── setup.md          # Initial setup
│   └── secrets.md       # Environment variables
└── development/
    ├── architecture.md   # System architecture
    └── contributing.md   # Development guide
```

## Progress

### ✅ Completed
- [x] Directory structure
- [x] `config/constants.js` - App constants
- [x] `utils/headers.js` - Header generation
- [x] `utils/validation.js` - URL validation
- [x] `utils/http.js` - HTTP utilities
- [x] `utils/response.js` - Response helpers
- [x] `utils/cache.js` - Cache interface
- [x] `utils/text.js` - Text processing

### 🔄 In Progress
- [ ] Extract scanner service
- [ ] Extract detector service
- [ ] Extract analyzer service
- [ ] Extract handlers
- [ ] Create new index.js router
- [ ] Consolidate documentation

### 📋 Next Steps
1. Extract services from `index.js`
2. Extract handlers from `index.js`
3. Create new modular `index.js`
4. Consolidate 88 MD files into `docs/`
5. Create professional README
6. Add TypeScript types
7. Clean up redundant files

## File Organization

### Keep
- `src/index.js` (refactored)
- `wrangler.toml`
- `package.json`
- `openapi.yaml`
- `gpt-instructions.md`
- `schemas/brief.js`
- `README.md` (new consolidated version)

### Archive to `docs/archive/`
- All `*-SUMMARY.md` files
- All `*-VERIFICATION.md` files
- All `STEP*-*.md` files
- All `TEST-*.md` files
- All `FIX-*.md` files
- All `UPDATE-*.md` files
- All `QUICK-*.md` files
- All `HOW-TO-*.md` files
- All `*-CHECKLIST.md` files
- All `*-GUIDE.md` files (except main ones)

### Consolidate into `docs/`
- API documentation
- Deployment guides
- Architecture docs
- Development guides

