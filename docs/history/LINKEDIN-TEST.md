# LinkedIn Profile Scanner Testing

## New Endpoint: POST /linkedin-profile

### Purpose
Scan public LinkedIn profiles and extract all profile elements, operating like a human browser to bypass bot protection.

### Features
- ✅ Human-like headers (LinkedIn-optimized)
- ✅ Comprehensive profile parsing
- ✅ Extracts all profile sections
- ✅ Caching support
- ✅ Bot protection detection

## Testing

### Basic Test
```bash
curl -X POST http://localhost:8787/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/example-profile"}' \
  | jq
```

### Test with Real Profile
```bash
# Replace with actual public LinkedIn profile URL
curl -X POST http://localhost:8787/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/username"}' \
  | jq '{name, headline, location, experience: (.experience | length), education: (.education | length), skills: (.skills | length)}'
```

### Check for Blocking
```bash
response=$(curl -s -X POST http://localhost:8787/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/username"}')

# Check for blocking
if echo "$response" | grep -qi "challenge\|blocked\|access denied"; then
  echo "❌ LinkedIn blocking detected"
else
  echo "✅ No blocking detected"
  echo "$response" | jq '.data.name'
fi
```

## Expected Response

```json
{
  "ok": true,
  "data": {
    "url": "https://www.linkedin.com/in/username",
    "name": "John Doe",
    "headline": "Software Engineer at Company",
    "location": "San Francisco, CA",
    "about": "About section text...",
    "experience": [
      {
        "title": "Software Engineer",
        "company": "Company Name",
        "duration": "2020 - Present",
        "location": "San Francisco, CA",
        "description": "Job description..."
      }
    ],
    "education": [
      {
        "school": "University Name",
        "degree": "Bachelor of Science",
        "field": "Computer Science",
        "duration": "2016 - 2020"
      }
    ],
    "skills": ["JavaScript", "Python", "React"],
    "connections": 500,
    "followers": 1000,
    "profileImage": "https://media.licdn.com/...",
    "extractedAt": "2024-01-15T10:30:00.000Z",
    "cache": {
      "hit": false,
      "ageSec": 0,
      "contentHash": "abc123..."
    }
  },
  "requestId": "1234567890-abc123"
}
```

## Error Responses

### Blocking Detected
```json
{
  "ok": false,
  "error": {
    "code": "BLOCKED",
    "message": "LinkedIn blocked the request. Profile may require authentication or have bot protection.",
    "details": {
      "status": 403,
      "url": "https://www.linkedin.com/in/username"
    }
  },
  "requestId": "..."
}
```

### Invalid URL
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid LinkedIn profile URL. Must be a linkedin.com/in/ or linkedin.com/pub/ URL"
  },
  "requestId": "..."
}
```

## Profile Elements Extracted

- ✅ Name
- ✅ Headline
- ✅ Location
- ✅ About section
- ✅ Experience (title, company, duration, description)
- ✅ Education (school, degree, field, duration)
- ✅ Skills
- ✅ Certifications
- ✅ Languages
- ✅ Connections count
- ✅ Followers count
- ✅ Profile image
- ✅ Background image
- ✅ Contact info
- ✅ Recommendations
- ✅ Publications
- ✅ Projects
- ✅ Volunteer experiences
- ✅ Honors/Awards
- ✅ Organizations
- ✅ Courses
- ✅ Test scores

## Bot Protection Handling

The endpoint:
1. Uses LinkedIn-optimized headers (more human-like)
2. Sets referer to Google (simulates search click)
3. Detects challenge pages
4. Returns BLOCKED error if bot protection is active
5. Caches successful results

## Limitations

- **Public profiles only**: Cannot access private profiles
- **Bot protection**: May be blocked if LinkedIn detects automation
- **Rate limiting**: LinkedIn may rate limit requests
- **HTML structure changes**: LinkedIn may change HTML structure, breaking parsing

## Troubleshooting

### Issue: Always getting BLOCKED
**Solutions**:
1. Update `getLinkedInHeaders()` with more realistic headers
2. Add delays between requests
3. Rotate User-Agent strings
4. Consider using proxy service

### Issue: Missing profile data
**Solutions**:
1. LinkedIn HTML structure may have changed
2. Update parsing patterns in `parseLinkedInProfile()`
3. Check if profile is actually public
4. Verify HTML is being fetched correctly

### Issue: Timeout errors
**Solutions**:
1. Increase timeout (currently 15 seconds)
2. Check network connectivity
3. LinkedIn may be slow to respond

---

**Status**: ✅ Endpoint implemented  
**Next**: Test with real LinkedIn profiles

