# How to Add YAML Endpoints to OpenAPI Schema

## 📋 Structure Pattern

Each endpoint in OpenAPI follows this structure:

```yaml
  /endpoint-path:
    method:  # get, post, put, delete, etc.
      operationId: functionName
      summary: Brief description
      description: Detailed description
      tags:
        - CategoryName
      requestBody:  # For POST/PUT/PATCH
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - field1
              properties:
                field1:
                  type: string
                  description: Field description
                  example: example value
      parameters:  # For GET endpoints
        - name: paramName
          in: query  # or path, header
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success response
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                    example: true
                  data:
                    type: object
                  requestId:
                    type: string
        '400':
          description: Bad request
        '500':
          description: Internal server error
```

## 🔧 Step-by-Step Guide

### 1. Choose the Endpoint Path
```yaml
  /extract:  # The endpoint path
```

### 2. Add Method (POST/GET/PUT/DELETE)
```yaml
    post:  # or get, put, delete
```

### 3. Add Operation ID (for ChatGPT Actions)
```yaml
      operationId: extractEvidence  # Must match function name pattern
```

### 4. Add Metadata
```yaml
      summary: Extract structured evidence pack
      description: Detailed description of what it does
      tags:
        - Extraction  # Categorizes the endpoint
```

### 5. Add Request Body (for POST)
```yaml
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - url  # Required fields
              properties:
                url:
                  type: string
                  format: uri
                  example: https://example.com
                mode:
                  type: string
                  enum: [fast, deep]
                  default: fast
```

### 6. Add Parameters (for GET)
```yaml
      parameters:
        - name: url
          in: query  # query, path, header
          required: true
          schema:
            type: string
            format: uri
```

### 7. Add Responses
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
                    example: true
                  data:
                    type: object
                  requestId:
                    type: string
        '400':
          description: Bad request
        '500':
          description: Internal server error
```

## 📝 Complete Example

Here's a complete POST endpoint example:

```yaml
  /extract:
    post:
      operationId: extractEvidence
      summary: Extract structured evidence pack from URL
      description: Extracts structured data from a URL including cleaned text, excerpts, entities, signals, claims, and metadata.
      tags:
        - Extraction
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - url
              properties:
                url:
                  type: string
                  format: uri
                  description: URL to extract data from
                  example: https://example.com
                mode:
                  type: string
                  enum: [fast, deep]
                  default: fast
      responses:
        '200':
          description: Successful extraction
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                    example: true
                  data:
                    type: object
                  requestId:
                    type: string
        '400':
          description: Bad request
        '500':
          description: Internal server error
```

## 🎯 Key Points

1. **Indentation**: Use 2 spaces (YAML is sensitive to indentation)
2. **operationId**: Should be camelCase and match the function name pattern
3. **tags**: Use for categorizing endpoints
4. **requestBody**: Only for POST/PUT/PATCH methods
5. **parameters**: Use for GET endpoints or path/query parameters
6. **responses**: Always include 200, 400, and 500
7. **schema**: Define the structure of request/response data

## ✅ Validation

After adding endpoints, validate the YAML:

```bash
# Check syntax
yamllint openapi.yaml

# Or use online validator
# https://editor.swagger.io/
```

## 📚 Common Types

- `string` - Text
- `integer` - Whole numbers
- `number` - Decimal numbers
- `boolean` - true/false
- `array` - List of items
- `object` - Key-value pairs
- `format: uri` - URL format
- `format: date-time` - ISO 8601 timestamp
- `enum: [value1, value2]` - Allowed values

---

**Status**: All 12 endpoints now in OpenAPI schema ✅

