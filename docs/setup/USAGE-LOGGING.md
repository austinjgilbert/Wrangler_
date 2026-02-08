# Usage Logging for Sanity Users

This service now automatically logs all API usage by Sanity users for analytics and monitoring purposes.

## Overview

Every API request is automatically logged to Sanity with the following information:
- User identification (from headers)
- Endpoint and HTTP method
- Request/response metadata
- Response status and timing
- Request/response sizes

## Schema

The usage logs are stored as `usageLog` documents in Sanity with the following fields:

- `userId` - Sanity user ID (required)
- `userEmail` - User email (if available)
- `endpoint` - API endpoint path (e.g., `/scan`, `/extract`)
- `method` - HTTP method (GET, POST, etc.)
- `requestId` - Correlation ID for the request
- `statusCode` - HTTP response status code
- `success` - Whether the request was successful (2xx status)
- `timestamp` - When the request occurred
- `responseTimeMs` - Request processing time in milliseconds
- `queryParams` - URL query parameters (sanitized, excludes sensitive data)
- `requestBodySize` - Request body size in bytes
- `responseBodySize` - Response body size in bytes
- `userAgent` - Client user agent string
- `ipAddress` - Client IP address (if available)
- `referer` - HTTP referer header
- `metadata` - Additional request metadata

## User Identification

The system extracts user identification from request headers in the following order:

1. `X-Sanity-User-Id` header
2. `X-User-Id` header
3. `X-Sanity-User` header
4. Authorization header (if it contains user ID)
5. Falls back to `'anonymous'` if no user ID is found

For user email:
1. `X-Sanity-User-Email` header
2. `X-User-Email` header
3. `X-Sanity-Email` header

## Implementation

### Files Created

1. **`schemas/usageLog.js`** - Sanity Studio schema for usage log documents
2. **`src/services/usage-logger.js`** - Usage logging service with:
   - `extractUserFromRequest()` - Extracts user ID and email from headers
   - `extractRequestMetadata()` - Extracts request metadata (query params, user agent, etc.)
   - `logUsage()` - Logs usage to Sanity
   - `withUsageLogging()` - Wrapper function for automatic logging (optional)

### Integration

Usage logging is integrated into the main request handler (`src/index.js`):
- Logs are created asynchronously after each request
- Logging failures don't break the API (fail silently)
- All endpoints are automatically logged

## Usage in Sanity Studio

Once deployed, you can view usage logs in Sanity Studio:

1. Go to your Sanity Studio
2. Navigate to the "Usage Log" document type
3. View logs filtered by:
   - User ID
   - Endpoint
   - Date range
   - Status code
   - Success/failure

## Querying Usage Logs

You can query usage logs via the `/query` endpoint:

```bash
# Get all usage logs for a specific user
curl "https://your-worker-url/query?type=query&q=*[_type=='usageLog' && userId=='user123']"

# Get usage logs for a specific endpoint
curl "https://your-worker-url/query?type=query&q=*[_type=='usageLog' && endpoint=='/scan']"

# Get recent usage logs
curl "https://your-worker-url/query?type=query&q=*[_type=='usageLog'] | order(timestamp desc) [0...100]"
```

## Analytics Queries

Example GROQ queries for analytics:

```groq
// Count requests per user
*[_type == "usageLog"] | group(userId) | {
  userId: _key,
  count: count()
}

// Average response time by endpoint
*[_type == "usageLog"] | group(endpoint) | {
  endpoint: _key,
  avgResponseTime: avg(responseTimeMs),
  count: count()
}

// Success rate by endpoint
*[_type == "usageLog"] | group(endpoint) | {
  endpoint: _key,
  successRate: count(success == true) / count() * 100,
  total: count()
}

// Usage by hour of day
*[_type == "usageLog"] | {
  hour: dateTime(timestamp).hour
} | group(hour) | {
  hour: _key,
  count: count()
}
```

## Privacy & Security

- Query parameters are sanitized to exclude sensitive data (tokens, keys, passwords, secrets, auth)
- IP addresses are logged but can be filtered out if needed
- User emails are optional and only logged if provided in headers
- All logging is asynchronous and non-blocking

## Configuration

No additional configuration is required. Usage logging works automatically if:
- Sanity is configured (SANITY_PROJECT_ID and SANITY_API_TOKEN secrets are set)
- The `usageLog` schema is deployed to your Sanity project

## Deployment

1. Deploy the schema to Sanity:
   ```bash
   # The schema file is in schemas/usageLog.js
   # Import it in your Sanity Studio's schema configuration
   ```

2. Deploy the worker:
   ```bash
   npm run deploy
   # or
   wrangler deploy
   ```

3. Usage logs will start appearing automatically for all API requests.

## Notes

- Logging is non-blocking and asynchronous
- If Sanity is not configured, logging is silently skipped
- Logging failures don't affect API responses
- The system automatically handles missing user identification (defaults to 'anonymous')
