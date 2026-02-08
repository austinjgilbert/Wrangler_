# Job Posting & Role Analysis

Your Website Scanner now analyzes job postings to identify recent hires, digital content/infrastructure roles, and role baselines for C-level, VP, Director, and Manager positions.

## 🎯 Features

### 1. Careers Page Detection
Automatically finds and analyzes:
- Careers/jobs pages (via navigation links)
- Common careers page paths (`/careers`, `/jobs`, `/hiring`, etc.)
- Job posting content and structured data (JSON-LD)

### 2. Recent Hires Detection
Identifies recent hires in digital/content/infrastructure roles by looking for:
- "Recently hired" announcements
- "New hire" mentions
- "Welcoming" new team members
- "Joined the team" announcements

### 3. Digital Content Roles
Detects job postings for:
- Content Manager/Director
- Content Strategy roles
- Content Marketing positions
- Editorial/Publishing roles
- Content-related positions

### 4. Infrastructure Roles
Detects job postings for:
- Infrastructure Engineer
- DevOps Engineer
- Platform Engineer
- Site Reliability Engineer (SRE)
- Cloud Engineer
- Infrastructure-related positions

### 5. Role Baselines
Extracts and analyzes job descriptions to understand how the company views:

#### C-Level Roles
- Chief Technology Officer (CTO)
- Chief Digital Officer
- Chief Product Officer
- Other C-level positions

#### VP Roles
- VP of Engineering
- VP of Product
- VP of Technology
- VP of Digital
- Other VP positions

#### Director Roles
- Director of Engineering
- Director of Product
- Director of Technology
- Director of Digital
- Director of Content
- Other Director positions

#### Manager Roles
- Engineering Manager
- Product Manager
- Content Manager
- Digital Manager
- Platform Manager
- Other Manager positions

## 📊 API Response Structure

### Job Analysis Object

```json
{
  "jobAnalysis": {
    "careersPageFound": true,
    "careersPageUrl": "https://example.com/careers",
    "recentHires": [
      {
        "title": "Senior Content Manager",
        "context": "We are excited to welcome our new Senior Content Manager"
      }
    ],
    "digitalContentRoles": [
      {
        "title": "Director of Content Strategy",
        "level": "Director"
      },
      {
        "title": "Content Marketing Manager",
        "level": "Manager"
      }
    ],
    "infrastructureRoles": [
      {
        "title": "VP of Platform Engineering",
        "level": "VP"
      },
      {
        "title": "Senior DevOps Engineer",
        "level": "Senior"
      }
    ],
    "roleBaselines": {
      "cLevel": [
        {
          "title": "Chief Technology Officer",
          "responsibilities": [
            "Lead technology strategy and architecture decisions",
            "Oversee platform infrastructure and scalability",
            "Drive digital transformation initiatives"
          ]
        }
      ],
      "vp": [
        {
          "title": "VP of Engineering",
          "responsibilities": [
            "Manage engineering teams and technical roadmap",
            "Oversee platform development and infrastructure"
          ]
        }
      ],
      "director": [
        {
          "title": "Director of Product",
          "responsibilities": [
            "Define product strategy and roadmap",
            "Work with engineering teams on platform features"
          ]
        }
      ],
      "manager": [
        {
          "title": "Content Manager",
          "responsibilities": [
            "Manage content creation and publishing workflows",
            "Oversee content strategy and editorial calendar"
          ]
        }
      ]
    },
    "totalJobsFound": 12
  }
}
```

## 💡 Sales Intelligence Use Cases

### 1. Identify Decision Makers
- **C-Level roles** = Strategic decision makers, budget authority
- **VP roles** = Department heads, key influencers
- **Director roles** = Operational decision makers
- **Manager roles** = Day-to-day users, pain point identifiers

### 2. Understand Organizational Structure
- Role baselines show how company views responsibilities
- Helps tailor messaging to specific role levels
- Identifies who owns content/infrastructure decisions

### 3. Timing & Urgency
- **Recent hires** = Active team expansion, good timing for outreach
- **Active hiring** = Budget available, growth phase
- **Digital content roles** = Investing in content capabilities
- **Infrastructure roles** = Investing in platform/scaling

### 4. Personalized Outreach
- Reference specific roles in outreach
- Align with detected responsibilities
- Connect to active hiring initiatives
- Address role-specific pain points

### 5. Opportunity Scoring
- Digital content/infrastructure roles detected = +5 opportunity score
- C-level/VP roles = Executive alignment ROI insights
- Active hiring = Growth & Investment ROI insights

## 🎯 Example Scenarios

### Scenario 1: Active Hiring for Digital Content
```json
{
  "digitalContentRoles": [
    {"title": "Director of Content Strategy", "level": "Director"},
    {"title": "Content Marketing Manager", "level": "Manager"}
  ],
  "recentHires": [
    {"title": "Senior Content Manager", "context": "We are excited..."}
  ]
}
```
**Sales Insight**: Active investment in content team - perfect timing for headless CMS pitch focused on content team productivity

### Scenario 2: Infrastructure Expansion
```json
{
  "infrastructureRoles": [
    {"title": "VP of Platform Engineering", "level": "VP"},
    {"title": "Senior DevOps Engineer", "level": "Senior"}
  ]
}
```
**Sales Insight**: Scaling infrastructure - headless CMS reduces infrastructure complexity and aligns with platform engineering goals

### Scenario 3: C-Level Role Baseline
```json
{
  "roleBaselines": {
    "cLevel": [
      {
        "title": "Chief Technology Officer",
        "responsibilities": [
          "Lead technology strategy and architecture decisions",
          "Oversee platform infrastructure and scalability"
        ]
      }
    ]
  }
}
```
**Sales Insight**: CTO owns technology strategy - strategic headless CMS pitch should focus on architecture and scalability benefits

## 🔄 Integration with Other Features

### Digital Goals Enhancement
- Digital content roles → Adds "Investing in digital content team" to technologyFocus
- Infrastructure roles → Adds "Investing in infrastructure team" to technologyFocus
- Recent hires → Adds "Recent hires detected" to growthIndicators

### ROI Insights Enhancement
- Digital content/infrastructure roles → "Growth & Investment" ROI insight
- C-level/VP roles → "Executive Alignment" ROI insight

### Opportunity Scoring
- Digital content/infrastructure roles detected → +5 points
- Helps prioritize prospects with active hiring

## 📈 Best Practices

1. **Use for Qualification**: Active hiring = budget available, growth phase
2. **Identify Decision Makers**: C-level/VP roles = strategic decision makers
3. **Timing**: Recent hires = good time to reach out (they're evaluating tools)
4. **Messaging**: Reference specific roles and responsibilities in outreach
5. **Prioritization**: Combine with opportunity scores for prioritization

## 🎓 GPT Integration

Your ChatGPT Custom GPT can now:
- Identify recent hires in digital roles
- Analyze role baselines to understand organizational structure
- Reference specific job postings in sales insights
- Connect hiring activity to digital transformation initiatives

---

**Your scanner now provides hiring and organizational intelligence!** 🎯

