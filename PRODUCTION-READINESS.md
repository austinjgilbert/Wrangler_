# Production Readiness Checklist

Use this checklist before deploying to production or scaling the system.

## Pre-Deploy

### Secrets & Configuration
- [ ] Set `SANITY_PROJECT_ID` and `SANITY_TOKEN`: `wrangler secret put SANITY_PROJECT_ID`
- [ ] Set `ADMIN_TOKEN` for write operations protection
- [ ] Set `MOLT_API_KEY` if using MoltBot/ChatGPT integration
- [ ] Set `BRAVE_SEARCH_API_KEY` if using web search features
- [ ] Set `TELEGRAM_BOT_TOKEN` if using Telegram bot
- [ ] Verify `BASE_URL` in `wrangler.toml` (production env) matches your deployed URL

### Rate Limiting ✅
- [x] KV namespace created and configured in `wrangler.toml`
- [x] Rate limiting enabled (uses KV for production, in-memory fallback for local)

### Sanity CMS
- [ ] Sanity project created and dataset configured
- [ ] API token has required permissions (read + write)
- [ ] Webhook secret set if using auto-enrichment: `wrangler secret put SANITY_WEBHOOK_SECRET`
- [ ] Webhook URL configured in Sanity Studio

## Security

### Implemented
- **SSRF protection**: Localhost and private IPs blocked
- **URL validation**: Invalid/malicious URLs rejected
- **Request size limit**: 10MB max for POST/PUT
- **Admin token**: Optional guard for write operations
- **CORS**: Configured (allow-all by default; restrict via reverse proxy if needed)
- **Rate limiting**: Enabled (in-memory or KV-based)
- **Input sanitization**: Applied on user-provided data

### Optional Hardening
- [ ] Restrict CORS origins via `CORS_ORIGINS` env var (requires code change to read it)
- [ ] Enable Cloudflare Access or API key auth for sensitive endpoints
- [ ] Review and limit `KNOWN_PATH_PREFIXES` to expose only needed routes

## Reliability

### Health & Monitoring
- [ ] `/health` endpoint used for uptime checks (no Sanity required)
- [ ] `/sanity/status` for Sanity connectivity verification
- [ ] Configure external monitoring (e.g. UptimeRobot) to ping `/health`
- [ ] Enable Cloudflare Workers analytics in dashboard
- [ ] Optional: Configure error tracking (Metrics class supports analytics URL)

### Error Handling
- Structured error responses with codes and request IDs
- Graceful degradation when Sanity/optional services unavailable
- Retries for transient failures (Sanity client, fetch)

## Performance

### Limits
- HTML size: 250KB per page
- Batch scan: 3 URLs (full) or 10 URLs (light mode)
- Concurrency limits on crawl/batch to avoid Cloudflare resource limits

### Caching (Optional)
- [ ] Uncomment `CACHE_KV` in `wrangler.toml` and create namespace for response caching
- [ ] Cache `/health` and `/schema` responses at CDN/reverse proxy level

## CI/CD

### GitHub Actions
- Build runs on push to `main`
- Unit tests run before deploy
- Wrangler deploy uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets

### Manual Deploy
```bash
npm run build
npm run test:unit
wrangler deploy --env=production   # or omit --env for default
```

## Post-Deploy Verification

1. **Health check**: `curl https://<your-worker>.workers.dev/health`
2. **Sanity status**: `curl https://<your-worker>.workers.dev/sanity/status`
3. **Scan test**: `curl "https://<your-worker>.workers.dev/scan?url=https://example.com"`
4. **Rate limit test**: Exceed limit and verify 429 response
5. **Account page**: `curl https://<your-worker>.workers.dev/accounts/<domain>`

## Scaling Notes

- **Workers Paid plan**: Enables Queues and Durable Objects for OSINT async jobs
- **KV namespaces**: Required for distributed rate limiting across instances
- **Cron triggers**: Configured for DQ scans and enrichment (see `wrangler.toml` triggers)
- **Sanity**: Ensure dataset and API quotas align with expected load

## Rollback

If a deploy fails or causes issues:
```bash
wrangler rollback --env=production
```
