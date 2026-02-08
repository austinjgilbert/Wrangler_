# LinkedIn Scanner Testing Guide

## ✅ Deployment Status

Worker deployed with:
- ✅ Enhanced LinkedIn headers (Chrome 131, full sec-ch-ua headers)
- ✅ 999 error detection and handling
- ✅ Improved referer strategy (Google search)
- ✅ Better error messages

## 🧪 Test Commands

### 1. Test Health Endpoint
```bash
curl https://website-scanner.austin-gilbert.workers.dev/health | jq
```

### 2. Test LinkedIn Endpoint (Your Profile)
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/austinjgilbert"}' \
  | jq
```

### 3. Test LinkedIn Endpoint (Another Profile)
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/username"}' \
  | jq
```

### 4. Test in ChatGPT
In your Custom GPT, try:
- "Analyze LinkedIn profile: https://www.linkedin.com/in/austinjgilbert"
- "Scan LinkedIn profile: https://www.linkedin.com/in/austinjgilbert"

## 📊 Expected Results

### Success Case
```json
{
  "ok": true,
  "data": {
    "url": "https://www.linkedin.com/in/austinjgilbert",
    "name": "Austin J. Gilbert",
    "headline": "...",
    "workPatterns": { ... },
    "network": { ... },
    "trajectory": { ... }
  }
}
```

### 999 Error Case (If Blocked)
```json
{
  "ok": false,
  "error": {
    "code": "LINKEDIN_BLOCKED",
    "message": "LinkedIn blocked the request with 999 status (bot protection)...",
    "details": {
      "status": 999,
      "hint": "LinkedIn has strict bot protection...",
      "workaround": "Consider using LinkedIn API or requesting manual profile data"
    }
  }
}
```

## 🔍 What to Check

1. **If 999 error**: LinkedIn is blocking - this is expected with their strict protection
2. **If 403 error**: Profile may require authentication
3. **If success**: Profile data should include workPatterns, network, trajectory

## 💡 If 999 Error Occurs

The enhanced headers may help, but LinkedIn's protection is very strict. Options:

1. **Try different profiles** - Some may be less protected
2. **Use LinkedIn API** - Official way to access data
3. **Manual entry** - User provides profile data
4. **Web search fallback** - Search for public information

## 🎯 Testing Checklist

- [ ] Health endpoint works
- [ ] LinkedIn endpoint responds (even if 999)
- [ ] Error messages are helpful
- [ ] ChatGPT Actions can call the endpoint
- [ ] Error handling provides workarounds

---

**Status**: Ready to test!  
**Worker URL**: https://website-scanner.austin-gilbert.workers.dev

