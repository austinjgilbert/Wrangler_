# Business Units & Digital Goals Detection

Your Website Scanner now detects organizational structure and future digital initiatives to provide deeper sales intelligence.

## 🏢 Business Unit Detection

The scanner identifies business units and functional areas running on the website by analyzing:
- Navigation menus
- Footer links
- Content sections
- Subdomains
- Separate properties

### Detected Business Areas

The scanner can identify:

1. **Legal** - Terms, privacy, compliance, regulatory pages
2. **Support** - Help, FAQ, documentation, knowledge base, tickets
3. **Localization** - Language selectors, translation services, i18n
4. **Marketing** - Blog, news, press, resources, case studies
5. **Product** - Product pages, features, solutions, platform info
6. **Customer Portal** - Login, dashboard, account management
7. **Hosted Services** - API, developer docs, integrations, webhooks
8. **Careers** - Job postings, hiring, team pages
9. **About** - Company info, team, leadership
10. **Investor Relations** - IR pages, financial info, shareholders
11. **Partners** - Partner programs, resellers, channel
12. **Community** - Forums, discussions, Discord, Slack
13. **Education/Training** - Learning resources, academy, courses
14. **Events** - Webinars, conferences, summits

### Subdomain Detection

Identifies subdomains that suggest separate managed properties:
- `app.example.com`
- `portal.example.com`
- `api.example.com`
- `docs.example.com`

### Separate Properties Detection

Detects:
- Different domains (e.g., `portal.company.com` vs `www.company.com`)
- Significant path differences (e.g., `/portal/`, `/app/`, `/dashboard/`)

### Silo Indicators

The scanner flags potential silo'd architecture:
- Multiple subdomains (3+)
- Separate properties detected
- Many business units (5+)
- Customer portal + hosted services combination

## 🎯 Digital Goals Detection

The scanner analyzes content to identify future digital initiatives and strategic direction.

### Technology Focus Areas

Detects focus on:
- **AI/ML Initiatives** - Artificial intelligence, machine learning platforms
- **Cloud Migration** - Moving to cloud, cloud-first strategy
- **Digital Transformation** - Modernization, digital initiatives
- **API-First Strategy** - Developer platforms, API ecosystems
- **Headless Architecture** - Decoupled, microservices
- **Mobile-First** - Mobile experience, responsive design
- **Personalization** - Customer experience, CX platforms
- **E-commerce Expansion** - Online stores, marketplaces
- **Content Strategy** - Content marketing, omnichannel
- **Data Analytics** - Business intelligence, data platforms

### Growth Indicators

Identifies:
- Active hiring for technical roles
- Active content marketing
- Developer-focused initiatives
- Platform and ecosystem growth

### Strategic Projects

Detects:
- Launching new platforms/products/services
- Upcoming releases/launches/features
- Building next-generation platforms
- Roadmap mentions (2024, 2025, quarters)
- Heavy investment in technology/platform/infrastructure

### Digital Transformation Signals

Identifies:
- Modernizing platform/infrastructure/stack
- Migrating to/from cloud/platform/system
- Upgrading technology/platform/system
- Transforming digital/business/experience
- Next phase of development/growth/expansion

## 📊 API Response Structure

### Business Units Object

```json
{
  "businessUnits": {
    "detectedAreas": [
      "Legal",
      "Support",
      "Marketing",
      "Product",
      "Customer Portal",
      "Hosted Services"
    ],
    "subdomains": [
      "app",
      "portal"
    ],
    "separateProperties": [
      "portal.example.com",
      "app.example.com/dashboard"
    ],
    "siloIndicators": [
      "Multiple subdomains detected (2) - potential silo'd architecture",
      "Many business units detected (6) - complex organizational structure"
    ],
    "totalAreas": 9
  }
}
```

### Digital Goals Object

```json
{
  "digitalGoals": {
    "initiatives": [
      "Focus on scaling - suggests active investment in improvements"
    ],
    "technologyFocus": [
      "AI/ML Initiatives",
      "Cloud Migration",
      "Headless Architecture",
      "Developer-focused initiatives - platform and ecosystem growth"
    ],
    "growthIndicators": [
      "Active hiring for technical roles - growth and expansion",
      "Active content marketing - likely investing in digital presence"
    ],
    "strategicProjects": [
      "Active development and investment in new initiatives"
    ],
    "digitalTransformationSignals": [
      "Digital transformation or modernization initiative detected"
    ]
  }
}
```

## 💡 Sales Intelligence Use Cases

### 1. Organizational Complexity Assessment
- **High totalAreas (5+)** = Complex organization, likely managing multiple systems
- **Multiple subdomains** = Separate managed properties, potential consolidation opportunity
- **Silo indicators** = Content duplication and workflow inefficiencies

### 2. Timing & Urgency
- **Digital transformation signals** = Active modernization = good timing for outreach
- **Strategic projects** = Investment in new initiatives = budget available
- **Growth indicators** = Scaling = need for better systems

### 3. Personalized Messaging
- Reference specific business units in outreach
- Align with detected technology focus areas
- Address silo'd architecture pain points
- Connect to digital transformation initiatives

### 4. Opportunity Scoring Enhancement
- Complex organizations (5+ areas) get +10 opportunity score boost
- Silo indicators add workflow efficiency ROI insights
- Digital transformation signals indicate active investment

## 🎯 Example Scenarios

### Scenario 1: Complex Enterprise
```json
{
  "businessUnits": {
    "detectedAreas": ["Legal", "Support", "Marketing", "Product", "Customer Portal", "Hosted Services", "Partners"],
    "subdomains": ["app", "portal", "api", "docs"],
    "totalAreas": 11,
    "siloIndicators": [
      "Multiple subdomains detected (4) - potential silo'd architecture",
      "Many business units detected (7) - complex organizational structure"
    ]
  }
}
```
**Sales Insight**: Complex organization with multiple managed properties - high consolidation opportunity

### Scenario 2: Digital Transformation
```json
{
  "digitalGoals": {
    "technologyFocus": ["Cloud Migration", "Headless Architecture"],
    "digitalTransformationSignals": [
      "Digital transformation or modernization initiative detected"
    ],
    "strategicProjects": [
      "Active development and investment in new initiatives"
    ]
  }
}
```
**Sales Insight**: Active modernization initiative - perfect timing for headless CMS pitch

### Scenario 3: Growth Company
```json
{
  "digitalGoals": {
    "growthIndicators": [
      "Active hiring for technical roles - growth and expansion"
    ],
    "technologyFocus": [
      "Developer-focused initiatives - platform and ecosystem growth"
    ]
  }
}
```
**Sales Insight**: Growing company investing in developer experience - headless CMS aligns with goals

## 🔄 Integration with ROI Insights

Business unit complexity automatically enhances ROI insights:

- **Complex organizations** get "System Consolidation" ROI insights
- **Silo indicators** add "Workflow Efficiency" pain points
- **High totalAreas** increases opportunity score

## 📈 Best Practices

1. **Use for Qualification**: High totalAreas = larger opportunity
2. **Timing**: Digital transformation signals = right time to reach out
3. **Messaging**: Reference specific detected areas in outreach
4. **Prioritization**: Combine with opportunity scores for prioritization

---

**Your scanner now provides organizational and strategic intelligence!** 🎯

