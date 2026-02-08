# Cloudflare Bot Protection Bypass

The worker has been updated to bypass Cloudflare's bot protection by making requests look like they're coming from a real browser.

## Changes Made

### Browser-Like Headers
All fetch requests now use browser-like headers instead of the generic "Website-Scanner/1.0" user agent:

- **User-Agent**: Modern Chrome browser string
- **Accept**: Full browser accept headers (HTML, images, etc.)
- **Accept-Language**: en-US,en;q=0.9
- **Accept-Encoding**: gzip, deflate, br
- **DNT**: 1 (Do Not Track)
- **Connection**: keep-alive
- **Upgrade-Insecure-Requests**: 1
- **Sec-Fetch-Dest**: document
- **Sec-Fetch-Mode**: navigate
- **Sec-Fetch-Site**: none (or same-origin for internal requests)
- **Sec-Fetch-User**: ?1
- **Cache-Control**: max-age=0
- **Referer**: Added for same-origin requests (robots.txt, sitemaps, careers pages)

## Implementation

The `getBrowserHeaders()` function generates these headers and is used for:
- Main homepage scans
- Robots.txt fetches
- Sitemap checks
- Careers page fetches

## Testing

Test with a Cloudflare-protected site:
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com"
```

## Limitations

While this helps bypass basic bot protection, some sites may still block requests if they:
- Use advanced bot detection (JavaScript challenges)
- Require cookies/sessions
- Use CAPTCHA challenges
- Have strict rate limiting

For sites with advanced protection, you may need to:
- Add delays between requests
- Use cookies/sessions (if available)
- Consider using a headless browser service (outside Cloudflare Workers)

## Notes

- The User-Agent is consistent (Chrome on macOS) to avoid detection patterns
- Referer headers are added for same-origin requests to appear more natural
- All standard browser headers are included to match real browser behavior

---

**Last Updated**: 2024-01-15

