# OSINT Pipeline Deployment Checklist

## Pre-Deployment

- [ ] Review all code changes
- [ ] Verify `wrangler.toml` has Queue and Durable Object bindings
- [ ] Ensure OpenAPI YAML is valid (3.1.0)
- [ ] Check that all imports/exports are correct

## Queue Setup

- [ ] Create OSINT queue: `wrangler queues create osint-queue`
- [ ] Verify queue exists: `wrangler queues list`

## Environment Variables

- [ ] Set `SANITY_PROJECT_ID`
- [ ] Set `SANITY_API_TOKEN`
- [ ] Set `SANITY_DATASET` (optional, defaults to "production")
- [ ] Set `SANITY_API_VERSION` (optional, defaults to "2023-10-01")
- [ ] Set `SANITY_USE_CDN` (optional, recommended: "false" for writes)
- [ ] Set `OSINT_DEFAULT_RECENCY_DAYS` (optional, default: 365)
- [ ] Set `OSINT_MAX_SOURCES` (optional, default: 25)
- [ ] Set `OSINT_MAX_EXTRACT` (optional, default: 15)
- [ ] Set `ADMIN_API_KEY` (optional, for /osint/run endpoint)

## Deployment

- [ ] Run `wrangler deploy`
- [ ] Verify deployment succeeded
- [ ] Check worker logs for errors

## Post-Deployment Testing

### 1. Health Check
```bash
curl https://your-worker.workers.dev/health
```

### 2. Queue OSINT Job
```bash
curl -X POST "https://your-worker.workers.dev/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "companyName": "Example Inc"
  }'
```

Expected: `{ "ok": true, "data": { "jobId": "...", "accountKey": "...", "queued": true } }`

### 3. Check Job Status
```bash
# Use accountKey from step 2
curl "https://your-worker.workers.dev/osint/status?accountKey=<accountKey>"
```

Expected: `{ "ok": true, "data": { "status": "queued" | "running" | "complete", ... } }`

### 4. Wait for Completion
- Poll `/osint/status` until `status: "complete"`
- Or check Sanity for `osintJob` document

### 5. Get Report
```bash
curl "https://your-worker.workers.dev/osint/report?accountKey=<accountKey>"
```

Expected: `{ "ok": true, "data": { "report": { ... } } }`

### 6. Test Admin Endpoint (if configured)
```bash
curl -X POST "https://your-worker.workers.dev/osint/run" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_API_KEY>" \
  -d '{
    "url": "https://example.com"
  }'
```

## Verification

- [ ] Queue consumer processes messages
- [ ] Durable Object tracks job state
- [ ] Sanity documents created (`osintJob`, `osintReport`, `account`)
- [ ] Report contains initiatives, risks, signals
- [ ] Existing endpoints still work (`/scan`, `/extract`, etc.)

## Troubleshooting

### Queue Not Processing
- Check queue exists: `wrangler queues list`
- Check worker logs: `wrangler tail`
- Verify queue binding in `wrangler.toml`

### Durable Object Not Working
- Check DO binding in `wrangler.toml`
- Verify export in `src/index.js`: `export { OsintJobState }`
- Check DO class name matches binding

### Sanity Errors
- Verify `SANITY_PROJECT_ID` and `SANITY_API_TOKEN` are set
- Check token has write permissions
- Verify dataset exists

### Pipeline Fails
- Check worker logs for specific stage failure
- Verify handler functions are accessible
- Check that `client` is passed to pipeline context

## Monitoring

- Monitor queue depth: `wrangler queues list`
- Watch worker logs: `wrangler tail`
- Check Sanity for document creation
- Monitor job completion rates

## Rollback Plan

If issues occur:
1. Revert to previous deployment: `wrangler rollback`
2. Or disable OSINT endpoints by removing routes from `index.js`
3. Existing endpoints remain unaffected

