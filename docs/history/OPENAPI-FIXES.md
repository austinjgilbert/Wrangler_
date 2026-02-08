# OpenAPI Spec Fixes for ChatGPT Actions

## Common Issues

### 1. OpenAPI Version
**Issue**: ChatGPT Actions requires `openapi: 3.0.0` (not 3.1.1)

**Fix**: Ensure first line is:
```yaml
openapi: 3.0.0
```

### 2. Object Schemas Must Have Properties
**Issue**: Object schemas without `properties` field cause parsing errors

**Fix**: All `type: object` schemas must have:
```yaml
type: object
properties: {}  # Even if empty
```

### 3. Response Schemas
**Issue**: Response schemas need proper structure

**Fix**: Ensure all responses have:
```yaml
responses:
  '200':
    description: Success
    content:
      application/json:
        schema:
          type: object
          properties:
            ok:
              type: boolean
```

### 4. Request Body Schemas
**Issue**: Request body must have complete schema

**Fix**: Ensure requestBody has:
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required:
          - fieldName
        properties:
          fieldName:
            type: string
```

## Validation

Use online validator:
- https://editor.swagger.io/
- Paste your YAML and check for errors

## Quick Fixes

1. **Change version to 3.0.0** (if it's 3.1.1)
2. **Add `properties: {}`** to any object schemas missing it
3. **Ensure all required fields are defined**
4. **Check for YAML syntax errors** (indentation, quotes)

