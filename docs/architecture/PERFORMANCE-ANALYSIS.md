# Website Performance Analysis

The worker now analyzes website performance and speed to provide benchmarks and conversation starters for improvement discussions.

## 🚀 Performance Metrics

### Performance Score (0-100)
Calculated based on:
- Page size optimization
- Script count and bundling
- External resource optimization
- Caching implementation
- CDN usage
- Performance optimization tools
- Modern frameworks

### Performance Levels
- **Excellent (80-100)**: Well-optimized, fast loading
- **Good (60-79)**: Acceptable performance with room for improvement
- **Needs Improvement (40-59)**: Performance issues impacting user experience
- **Poor (0-39)**: Significant performance problems

## 📊 What's Analyzed

### Speed Indicators (Positive)
- Caching enabled
- CDN usage (Cloudflare, AWS CloudFront, etc.)
- Compression (gzip, brotli)
- Modern frameworks (Next.js, Gatsby)
- Performance optimization tools
- Modern image formats (WebP, AVIF)

### Performance Issues (Negative)
- Large page size (>1MB)
- Too many scripts (>30)
- Many external scripts (>20)
- Caching disabled
- No optimization tools detected

### Optimization Tools Detected
- Lazy Loading
- Image Optimization
- Code Splitting
- Service Worker
- Resource Hints (preconnect, dns-prefetch, preload)
- Minification
- CDN

## 📈 Benchmarks

### Industry Standards
- **Page Load Time**: < 3 seconds
- **Page Size**: < 1MB
- **Script Count**: < 30 scripts
- **External Requests**: < 20 external resources

### Current State Comparison
The analysis compares:
- Current page size vs. < 1MB standard
- Current script count vs. < 30 standard
- Current external scripts vs. < 20 standard
- Optimization tools in use

## 💬 Conversation Starters

The analysis provides ready-to-use conversation starters:

**Example:**
- "I noticed your site has 3 performance issues that could be impacting user experience and conversions."
- "Your site's performance score is 65/100. Industry standard is 80+. We can help improve this."
- "Your page size is 2.1MB. Optimizing this could improve load times by 30-50%."
- "You're loading 45 scripts. Bundling and optimization could reduce this significantly and improve speed."

## 🎯 Recommendations

Automatically generated recommendations based on detected issues:
- Implement CDN for faster global delivery
- Enable caching headers for repeat visitors
- Optimize and compress images
- Bundle and minify JavaScript files
- Consider code splitting for faster initial load
- Reduce external script dependencies
- Implement lazy loading
- Add service worker for offline capabilities

## 📊 API Response

```json
{
  "performance": {
    "pageSize": 524288,
    "speedIndicators": [
      "Caching enabled",
      "Cloudflare CDN (likely HTTP/2 or HTTP/3)"
    ],
    "performanceIssues": [
      "Many scripts detected (45) - may slow page load",
      "Many external scripts (25) - multiple DNS lookups slow loading"
    ],
    "optimizationTools": [
      "Lazy Loading",
      "CDN"
    ],
    "benchmarks": {
      "industryStandard": {
        "pageLoadTime": "< 3 seconds",
        "pageSize": "< 1MB",
        "scriptCount": "< 30 scripts",
        "externalRequests": "< 20 external resources"
      },
      "currentState": {
        "pageSize": "512KB",
        "scriptCount": 45,
        "externalScripts": 25,
        "optimizationTools": 2
      },
      "score": 65
    },
    "performanceScore": 65,
    "level": "Good",
    "recommendations": [
      "Bundle and minify JavaScript files",
      "Implement lazy loading for images",
      "Reduce external script dependencies"
    ],
    "conversationStarters": [
      "I noticed your site has 3 performance issues that could be impacting user experience and conversions.",
      "Your site's performance score is 65/100. Industry standard is 80+. We can help improve this."
    ]
  }
}
```

## 💡 Use Cases

### 1. Opening Performance Conversations
Use `conversationStarters` to begin discussions:
- "I noticed your site has [X] performance issues..."
- "Your performance score is [X]/100. Industry standard is 80+..."

### 2. Quantifying Impact
Use benchmarks to show gaps:
- "Industry standard is < 30 scripts, you have [X]"
- "Your page size is [X]MB vs. < 1MB standard"

### 3. Prioritizing Improvements
Use recommendations to suggest actions:
- Focus on highest-impact issues first
- Reference specific optimization tools needed

### 4. ROI Discussions
Connect performance to business outcomes:
- "Slow load times can reduce conversions by 7% per second"
- "Performance improvements typically increase conversions by 10-20%"

## 🔄 Integration with Other Features

Performance analysis enhances:
- **Business Scale**: Large sites with poor performance = high improvement opportunity
- **AI Readiness**: Performance optimization aligns with modern infrastructure needs
- **Migration Opportunities**: Performance issues can be addressed with headless CMS migration

---

**Last Updated**: 2024-01-15

