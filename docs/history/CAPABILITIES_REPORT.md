# Website Scanner Worker - Complete Capabilities Report

**Version:** 1.1.0  
**Deployment:** https://website-scanner.austin-gilbert.workers.dev  
**Platform:** Cloudflare Workers  
**Last Updated:** January 2026

---

## Executive Summary

The Website Scanner Worker is a comprehensive, production-ready API service that provides deep website intelligence, competitive research, and strategic business analysis. Built on Cloudflare Workers for global edge performance, it offers 38+ JavaScript modules, 25+ API endpoints, and seamless integration with Sanity CMS for data persistence.

### Core Value Proposition

- **Automated Intelligence Gathering**: From single website scans to comprehensive year-ahead company intelligence
- **Competitive Analysis**: Automated competitor discovery and benchmarking
- **Strategic Insights**: Timeline tracking, progress monitoring, and industry benchmarking
- **Sales Enablement**: ROI-focused analysis with opportunity scoring and pitch recommendations
- **Research Automation**: Multi-stage enrichment pipelines for comprehensive account intelligence

---

## 1. Website Scanning & Analysis

### 1.1 Single Website Scanning (`GET /scan`)

**Capabilities:**
- **Tech Stack Detection**: Identifies 50+ technologies including:
  - CMS platforms (WordPress, Drupal, Contentful, Sanity, etc.)
  - Frontend frameworks (React, Vue, Angular, Next.js, etc.)
  - E-commerce platforms (Shopify, WooCommerce, Magento, etc.)
  - Cloud infrastructure (AWS, Azure, GCP indicators)
  - Analytics and marketing tools
  - Legacy systems detection

- **AI Readiness Scoring** (0-100):
  - Analyzes technology stack for AI/ML capabilities
  - Identifies mismatches and gaps
  - Provides education and next steps
  - Justifies scores with specific evidence

- **Performance Analysis**:
  - Performance score (0-100)
  - Identifies performance issues
  - Compares against industry benchmarks
  - Provides conversation starters for speed/UX discussions

- **Business Scale Intelligence**:
  - Traffic indicators (estimated monthly traffic)
  - Revenue indicators (estimated annual revenue)
  - Infrastructure cost estimates
  - Monetization methods detection
  - Business unit identification

- **Opportunity Scoring** (0-100):
  - Calculates ROI potential
  - Identifies migration opportunities
  - Highlights pain points
  - System duplication detection

**Output Includes:**
- Complete technology stack breakdown
- HTML snippet analysis
- Script and link analysis
- Robots.txt detection
- Security headers analysis
- Business unit structure
- Digital goals and initiatives
- Job posting analysis (careers page)

### 1.2 Batch Scanning (`GET /scan-batch`)

**Capabilities:**
- Lightweight batch processing (3-10 URLs recommended)
- Concurrent scanning with rate limiting
- Stack ranking of results
- Failure handling and retry logic
- Summary statistics

**Use Cases:**
- Initial account list screening
- Competitive landscape analysis
- Technology trend identification
- Quick opportunity assessment

---

## 2. OSINT (Open Source Intelligence) Pipeline

### 2.1 Year-Ahead Company Intelligence

**Pipeline Overview:**
The OSINT pipeline generates comprehensive year-ahead intelligence reports with rolling 12-month look-ahead, timeline tracking, and industry benchmarking.

**Pipeline Stages:**

1. **Stage 0: Account Context Loading**
   - Loads or creates account in Sanity CMS
   - Normalizes URLs and generates account keys
   - Establishes company identity

2. **Stage 1: Page Discovery**
   - Discovers key pages on company website
   - Identifies pricing, security, docs, careers pages
   - Prioritizes pages for crawling

3. **Stage 1.5: Common Page Crawling**
   - Crawls investor relations pages
   - Extracts sustainability reports
   - Analyzes about/leadership pages
   - Reviews careers pages for hiring signals
   - Extracts news and press releases

4. **Stage 2: Web Search**
   - Searches for company news and announcements
   - Finds roadmap and strategy documents
   - Discovers initiative mentions
   - Uses rolling 12-month time window

5. **Stage 3: Source Ranking**
   - Applies sophisticated ranking algorithm:
     - **Recency boost**: <= 90 days (100), <= 180 days (70), <= 365 days (40)
     - **First-party boost**: +30 for company's own domain
     - **Numeric/timeline boost**: +5-20 for dates, years, roadmap keywords
     - **Quality score**: Penalizes spam, rewards substantial content
     - **Corroboration boost**: +3-15 per additional source
   - Selects top 25 sources by default

6. **Stage 4: Evidence Extraction**
   - Extracts structured evidence from top sources
   - Identifies initiatives, goals, and commitments
   - Captures timelines and deadlines
   - Extracts up to 15 key pieces of evidence

7. **Stage 5: Verification** (Optional)
   - Verifies claims against multiple sources
   - Cross-references information
   - Validates timeline information

8. **Stage 6: Report Synthesis**
   - **Timeline Tracking**: Compares with historical 12-month data
   - **Status Detection**: Determines initiative status:
     - `happening`: Active, in progress
     - `being_decided`: Planning/decision phase
     - `needing_execution`: Planned, not started
     - `historical`: Completed or cancelled
   - **Progress Tracking**: Monitors completion rates
   - **Industry Benchmarking**: Compares against competitors
   - **Executive Summary**: High-level overview with insights
   - **Recommended Next Steps**: Actionable recommendations

9. **Stage 7: Storage**
   - Stores `osintJob` document (job tracking)
   - Stores `osintReport` document (full report)
   - Links to account document
   - Updates account with latest report reference

### 2.2 OSINT Report Structure

**Executive Summary:**
- High-level overview with benchmarking insights
- Key initiatives and priorities
- Industry position and competitive standing

**Initiatives** (Ranked by importance, 0-100):
- Title and description
- Importance score (0-100)
- Confidence level (low/medium/high)
- Time horizon (0-3mo, 3-12mo, 12mo+)
- Status (happening, being_decided, needing_execution, historical)
- Progress percentage (for active initiatives)
- Expected completion date
- First mentioned date
- Historical reference (if continuation)
- Completion status (completed, in_progress, delayed, cancelled)
- Evidence citations with URLs

**Historical Initiatives:**
- Initiatives from 12 months ago
- Completion status tracking
- Progress comparison

**Timeline Analysis:**
- Historical initiative count
- Completed count
- In-progress count
- Delayed count
- Cancelled count
- Completion rate percentage
- Continuation count
- New initiatives count

**Industry Benchmarking:**
- **Industry Averages**:
  - Average initiative count
  - Average completion rate
  - Average in-progress count
  - Common goals and trends
  - Initiative status distribution
  - Sample size
- **Competitor Benchmarks** (Top 10):
  - Individual competitor metrics
  - Initiative counts
  - Completion rates
  - Top initiatives
  - Relative positioning
- **Company Position**:
  - Initiative count rank
  - Completion rate rank
  - Relative position (ahead/at_parity/behind)
  - Percentile rankings
- **Actionable Insights**:
  - Industry comparison insights
  - Competitive positioning
  - Recommendations based on benchmarking

**Risks:**
- Identified challenges or concerns
- Potential blockers
- Market risks

**Hiring Signals:**
- Job postings detected
- Recruitment indicators
- Growth signals

**Digital Signals:**
- Technology transformation indicators
- Digital initiative signals
- Modernization efforts

**Page Insights:**
- Insights from crawled common pages
- Investor relations highlights
- Sustainability commitments
- Leadership announcements

**Recommended Next Steps:**
- Actionable recommendations
- Status-based guidance
- Benchmarking-informed suggestions

**Sources:**
- Ranked list of sources used
- URLs, titles, publication dates
- Source scores

### 2.3 OSINT Endpoints

- **`POST /osint/queue`**: Queue an OSINT job (rolling 12-month look-ahead)
- **`GET /osint/status?accountKey=...`**: Check job status with progress tracking
- **`GET /osint/report?accountKey=...`**: Retrieve generated report
- **`POST /osint/run`**: Run synchronously (admin/debug, requires ADMIN_API_KEY)

**Idempotency:**
- Jobs are idempotent per `accountKey + mode + dateRange`
- Safe to re-queue without duplication
- Returns existing job if complete report exists

---

## 3. Competitor Research

### 3.1 Competitor Discovery

**Strategies:**
1. **Technology-Based**: Finds companies using similar tech stacks
2. **Industry-Based**: Identifies companies in same industry
3. **Business Model**: Matches similar business models
4. **Geography**: Finds regional competitors
5. **Market Positioning**: Identifies similar market positions

**Capabilities:**
- Discovers top 5-20 competitors automatically
- Handles domain normalization (www vs non-www)
- Case-insensitive matching
- Fallback strategies if specific matches not found

### 3.2 Comparative Analysis

**Metrics Compared:**
- Technology stack similarity
- Performance metrics
- Business scale indicators
- AI readiness scores
- Opportunity scores
- Initiative counts (from OSINT reports)
- Completion rates

**Output:**
- Competitive positioning
- Technology gaps
- Performance comparisons
- Opportunity rankings

### 3.3 Competitor Endpoints

- **`POST /competitors/research`**: Research competitors for an account
- **`GET /competitors/research?accountKey=...`**: Get competitor research results
- **`GET /competitors/opportunities`**: Get prospecting opportunities based on competitor analysis

---

## 4. Account Enrichment Pipeline

### 4.1 Multi-Stage Enrichment

**Stages Available:**
- `scan`: Full website scan
- `discover`: Page discovery
- `osint`: OSINT intelligence generation
- `linkedin`: LinkedIn profile analysis
- `brief`: Research brief generation

**Capabilities:**
- Queue enrichment jobs
- Track enrichment status
- Execute specific stages
- Retrieve enrichment research sets
- List all enrichment jobs

### 4.2 Enrichment Endpoints

- **`POST /enrich/queue`**: Queue an enrichment job
- **`GET /enrich/status?accountKey=...`**: Get enrichment job status
- **`GET /enrich/research?accountKey=...`**: Get enrichment research set
- **`POST /enrich/execute`**: Execute a specific enrichment stage
- **`GET /enrich/jobs`**: List all enrichment jobs

---

## 5. Research Tools

### 5.1 Page Discovery (`POST /discover`)

**Capabilities:**
- Discovers likely pages on a website
- Identifies:
  - Pricing pages
  - Security/compliance pages
  - Documentation
  - Careers/jobs pages
  - About/company pages
  - Contact pages
  - Blog/news pages

**Output:**
- Prioritized page list
- Page types and categories
- Confidence scores

### 5.2 Web Search (`POST /search`)

**Capabilities:**
- Web search with ranking
- Deduplication of results
- Relevance scoring
- Recency weighting
- Source quality assessment

**Features:**
- Configurable result limits
- Query optimization
- Result ranking algorithm

### 5.3 Evidence Extraction (`POST /extract`)

**Capabilities:**
- Extracts structured evidence from URLs
- Identifies:
  - Key excerpts
  - Entities (people, companies, technologies)
  - Signals (hiring, expansion, partnerships)
  - Claims and statements
  - Dates and timelines

**Modes:**
- `fast`: Quick extraction
- `deep`: Comprehensive extraction

### 5.4 Page Crawling (`POST /crawl`)

**Capabilities:**
- Crawls discovered pages
- Concurrency limits for performance
- Extracts full text content
- Preserves page structure
- Handles errors gracefully

### 5.5 Claim Verification (`POST /verify`)

**Capabilities:**
- Verifies claims against multiple sources
- Cross-references information
- Validates accuracy
- Provides confidence scores

### 5.6 Research Brief Generation (`POST /brief`)

**Capabilities:**
- Generates action-ready research briefs
- Includes citations and sources
- Structured format
- Auto-saves to Sanity CMS
- Can derive seed URL from company name

**Output:**
- Executive summary
- Key findings
- Evidence citations
- Recommended actions

---

## 6. LinkedIn Profile Analysis

### 6.1 Profile Scanning (`POST /linkedin-profile`)

**Capabilities:**
- Scans public LinkedIn profiles
- Extracts:
  - Work history
  - Education
  - Skills
  - Connections
  - Recommendations
  - Publications

**Analytics Provided:**
- **Work Patterns**:
  - Job change frequency
  - Tenure trends
  - Role progression
  - Career stage assessment
  - Opportunities and risks

- **Network Analysis**:
  - Direct connections
  - Shared experiences/education
  - Potential 2nd-degree paths
  - Network strength assessment

- **Trajectory Analysis**:
  - Overall career trend
  - Key milestones
  - Skill growth patterns
  - Market value assessment
  - Next steps and growth opportunities

**Auto-Save:** Results automatically stored in Sanity CMS

**Note:** LinkedIn has strict bot protection. System includes enhanced headers and fallback strategies.

---

## 7. Account Intelligence

### 7.1 Comprehensive Intelligence (`GET /research/intelligence`)

**Capabilities:**
- Aggregates all available intelligence for an account
- Combines:
  - Scan data
  - OSINT reports
  - Competitor research
  - Enrichment data
  - Learning insights

**Output:**
- Unified intelligence view
- Cross-referenced insights
- Comprehensive account profile

---

## 8. Learning & Insights

### 8.1 Job Posting Analysis (`POST /learning/analyze`)

**Capabilities:**
- Analyzes job postings
- Extracts:
  - Required skills
  - Technology requirements
  - Role types
  - Department indicators
  - Growth signals

### 8.2 Learning Insights (`GET /learning/insights?accountKey=...`)

**Capabilities:**
- Retrieves learning insights for an account
- Aggregates job posting data
- Identifies trends and patterns
- Provides strategic insights

---

## 9. Sanity CMS Integration

### 9.1 Data Storage

**Document Types:**
- `account`: Company/account records
- `accountPack`: Full scan payloads
- `osintJob`: OSINT job tracking
- `osintReport`: OSINT intelligence reports
- `scannerAccount`: Website scanner account records
- `linkedin`: LinkedIn profile data
- `evidence`: Extracted evidence packs
- `brief`: Research briefs

**Auto-Save Operations:**
- Website scans automatically saved
- LinkedIn profiles automatically saved
- Evidence extraction automatically saved
- Research briefs automatically saved
- OSINT reports automatically saved

### 9.2 Data Querying

**Query Types:**
- **Companies**: Filter by opportunity score, search terms
- **Search**: Full-text search across documents
- **Custom GROQ**: Execute custom Sanity GROQ queries

**Capabilities:**
- Filter by opportunity score
- Search by keywords
- Query by document type
- Custom GROQ queries
- Pagination support

### 9.3 Data Management

- **`POST /store/{type}`**: Store data (scan, linkedin, evidence, brief, account)
- **`GET /query`**: Query stored data
- **`POST /query`**: Execute custom GROQ query
- **`PUT /update/{docId}`**: Update existing documents
- **`DELETE /delete/{docId}`**: Delete documents

---

## 10. Utility Endpoints

### 10.1 Health Check (`GET /health`)

**Capabilities:**
- Service health status
- Dependency checks (Sanity, Queues, Durable Objects)
- Configuration validation
- Returns service status and dependencies

### 10.2 API Schema (`GET /schema`)

**Capabilities:**
- Returns OpenAPI 3.1.0 specification
- Complete API documentation
- Schema definitions
- Endpoint descriptions

### 10.3 Cache Status (`GET /cache/status?url=<url>`)

**Capabilities:**
- Check cache status for URLs
- Cache hit/miss information
- TTL information

---

## 11. Technical Capabilities

### 11.1 Performance Features

- **Concurrency Control**: Controlled via `mapWithConcurrency`
- **Timeouts**: All fetch operations have timeouts
- **Memory Management**: HTML size limits (250KB default)
- **Caching**: KV-based caching with 24h TTL (optional)
- **Batch Limits**: Configurable to prevent resource exhaustion
- **Queue Processing**: OSINT jobs process with retry on failure

### 11.2 Security Features

- **SSRF Protection**: Blocks localhost and private IPs
- **URL Validation**: Comprehensive URL validation and sanitization
- **CORS Headers**: Properly configured CORS support
- **Input Size Limits**: Request size limits to prevent abuse
- **Admin Authentication**: Optional admin tokens for write operations
- **Header Sanitization**: Only returns allowed headers

### 11.3 Error Handling

- **Standardized Responses**: Consistent error response format
- **Error Codes**: Descriptive error codes
- **Request IDs**: Correlation IDs for debugging
- **Graceful Degradation**: Handles failures gracefully
- **Retry Logic**: Automatic retries for transient failures

---

## 12. Integration Capabilities

### 12.1 ChatGPT Custom GPT Actions

**Integration:**
- Full OpenAPI 3.1.0 specification
- All endpoints available as GPT actions
- Auto-save functionality
- Comprehensive GPT instructions

**Available Actions:**
- `scanHomepage`
- `scanBatchAccounts`
- `scanLinkedInProfile`
- `extractEvidence`
- `searchWeb`
- `discoverPages`
- `crawlPages`
- `verifyClaims`
- `generateBrief`
- `queueOsintJob`
- `getOsintStatus`
- `getOsintReport`
- `runOsintSync`
- `storeData`
- `queryData`
- `updateDocument`
- `deleteDocument`

### 12.2 Sanity CMS

**Integration:**
- Full CRUD operations
- Document type definitions
- Schema support
- GROQ query support
- Auto-save functionality
- Account aggregation

### 12.3 Cloudflare Workers

**Platform Features:**
- Global edge deployment
- Automatic scaling
- Durable Objects support (for job state)
- Queue support (for async processing)
- KV storage (for caching)

---

## 13. Use Cases

### 13.1 Sales Intelligence

- **Account Research**: Comprehensive account intelligence gathering
- **Opportunity Scoring**: Identify high-value prospects
- **Competitive Analysis**: Understand competitive landscape
- **ROI Analysis**: Calculate opportunity scores and ROI potential
- **Pitch Preparation**: Generate research briefs and insights

### 13.2 Competitive Intelligence

- **Competitor Discovery**: Automatically find competitors
- **Benchmarking**: Compare against industry and competitors
- **Technology Tracking**: Monitor competitor tech stacks
- **Initiative Tracking**: Track competitor initiatives and progress

### 13.3 Strategic Planning

- **Year-Ahead Intelligence**: Understand company plans for next 12 months
- **Timeline Tracking**: Monitor initiative progress over time
- **Risk Assessment**: Identify risks and challenges
- **Opportunity Identification**: Find new opportunities

### 13.4 Market Research

- **Technology Trends**: Identify technology adoption patterns
- **Industry Analysis**: Understand industry benchmarks
- **Company Profiling**: Build comprehensive company profiles
- **Relationship Mapping**: Map connections and relationships

### 13.5 Recruitment & Talent

- **LinkedIn Analysis**: Analyze candidate profiles
- **Job Posting Analysis**: Understand hiring needs
- **Career Trajectory**: Assess career progression
- **Network Mapping**: Map professional networks

---

## 14. Data Output Formats

### 14.1 Scan Response

```json
{
  "ok": true,
  "data": {
    "input": "...",
    "finalUrl": "...",
    "status": 200,
    "technologyStack": {...},
    "aiReadiness": {...},
    "performance": {...},
    "businessScale": {...},
    "businessUnits": {...},
    "digitalGoals": {...},
    "jobAnalysis": {...}
  }
}
```

### 14.2 OSINT Report

```json
{
  "ok": true,
  "data": {
    "report": {
      "accountKey": "...",
      "executiveSummary": [...],
      "initiatives": [...],
      "historicalInitiatives": [...],
      "timelineAnalysis": {...},
      "benchmarking": {...},
      "risks": [...],
      "hiringSignals": [...],
      "digitalSignals": [...],
      "recommendedNextSteps": [...],
      "sources": [...]
    }
  }
}
```

### 14.3 Competitor Research

```json
{
  "ok": true,
  "data": {
    "competitors": [...],
    "comparativeAnalysis": {...},
    "opportunities": [...]
  }
}
```

---

## 15. Configuration & Deployment

### 15.1 Required Configuration

**Sanity CMS:**
- `SANITY_PROJECT_ID`
- `SANITY_API_TOKEN`
- `SANITY_DATASET` (optional, defaults to "production")
- `SANITY_API_VERSION` (optional, defaults to "2023-10-01")

**Optional Configuration:**
- `ADMIN_TOKEN`: For write operation protection
- `ADMIN_API_KEY`: For `/osint/run` endpoint
- `OSINT_DEFAULT_RECENCY_DAYS`: Default 365
- `OSINT_MAX_SOURCES`: Default 25
- `OSINT_MAX_EXTRACT`: Default 15

### 15.2 Deployment

- **Platform**: Cloudflare Workers
- **Deployment**: `wrangler deploy --env production`
- **Free Plan**: Works with synchronous OSINT execution
- **Paid Plan**: Supports async queues and Durable Objects

---

## 16. Statistics & Scale

- **38 JavaScript Modules**: Comprehensive codebase
- **5 Handler Modules**: Request handling
- **15 Service Modules**: Business logic
- **25+ API Endpoints**: Full feature set
- **50+ Technologies Detected**: Tech stack analysis
- **10+ Document Types**: Sanity CMS integration
- **Global Edge Deployment**: Cloudflare Workers network

---

## 17. Summary

The Website Scanner Worker is a comprehensive, production-ready intelligence platform that provides:

1. **Deep Website Analysis**: Tech stack, AI readiness, performance, business scale
2. **Year-Ahead Intelligence**: OSINT pipeline with timeline tracking and benchmarking
3. **Competitive Research**: Automated competitor discovery and analysis
4. **Account Enrichment**: Multi-stage enrichment pipelines
5. **Research Automation**: Discovery, search, extraction, crawling, verification
6. **LinkedIn Analysis**: Profile scanning with career trajectory analysis
7. **Data Persistence**: Full Sanity CMS integration with auto-save
8. **ChatGPT Integration**: Complete GPT Actions support
9. **Production Ready**: Security, error handling, performance optimization

**Perfect for:**
- Sales teams needing account intelligence
- Competitive intelligence teams
- Market researchers
- Strategic planners
- Recruitment teams
- Business development professionals

---

**Built with ❤️ using Cloudflare Workers**

For questions or support, see the README.md or open an issue on the repository.

