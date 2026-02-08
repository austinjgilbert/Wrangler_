/**
 * Input Validation Middleware
 * Validates request bodies and parameters against schemas
 */

import { createErrorResponse } from './response.js';

/**
 * Validate request body against schema
 * @param {any} body - Request body
 * @param {object} schema - Validation schema
 * @returns {{valid: boolean, errors?: string[]}}
 */
export function validateSchema(body, schema) {
  const errors = [];
  
  if (!schema) {
    return { valid: true };
  }
  
  // Required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Type validation
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in body) {
        const value = body[field];
        const type = fieldSchema.type;
        
        // Type check
        if (type === 'string' && typeof value !== 'string') {
          errors.push(`Field ${field} must be a string`);
        } else if (type === 'number' && typeof value !== 'number') {
          errors.push(`Field ${field} must be a number`);
        } else if (type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field ${field} must be a boolean`);
        } else if (type === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${field} must be an array`);
        } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          errors.push(`Field ${field} must be an object`);
        }
        
        // Format validation (URL, email, etc.)
        if (fieldSchema.format === 'uri' && typeof value === 'string') {
          try {
            new URL(value);
          } catch {
            errors.push(`Field ${field} must be a valid URL`);
          }
        }
        
        if (fieldSchema.format === 'email' && typeof value === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`Field ${field} must be a valid email`);
          }
        }
        
        // Enum validation
        if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
          errors.push(`Field ${field} must be one of: ${fieldSchema.enum.join(', ')}`);
        }
        
        // Min/Max validation
        if (type === 'string' && fieldSchema.minLength && value.length < fieldSchema.minLength) {
          errors.push(`Field ${field} must be at least ${fieldSchema.minLength} characters`);
        }
        
        if (type === 'string' && fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
          errors.push(`Field ${field} must be at most ${fieldSchema.maxLength} characters`);
        }
        
        if (type === 'number' && fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
          errors.push(`Field ${field} must be at least ${fieldSchema.minimum}`);
        }
        
        if (type === 'number' && fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
          errors.push(`Field ${field} must be at most ${fieldSchema.maximum}`);
        }
        
        if (type === 'array' && fieldSchema.minItems && value.length < fieldSchema.minItems) {
          errors.push(`Field ${field} must have at least ${fieldSchema.minItems} items`);
        }
        
        if (type === 'array' && fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
          errors.push(`Field ${field} must have at most ${fieldSchema.maxItems} items`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Create validation middleware
 * @param {object} schema - Validation schema
 * @returns {Function} - Middleware function
 */
export function validateRequest(schema) {
  return async (request, handler, requestId) => {
    try {
      // Only validate POST/PUT requests with body
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const body = await request.json();
        const validation = validateSchema(body, schema);
        
        if (!validation.valid) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Request validation failed',
            { errors: validation.errors },
            400,
            requestId
          );
        }
        
        // Create new request with validated body
        const validatedRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(body),
        });
        
        return handler(validatedRequest);
      }
      
      // For GET/DELETE, just call handler
      return handler(request);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid JSON in request body',
          {},
          400,
          requestId
        );
      }
      throw error;
    }
  };
}

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  scanRequest: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
      store: { type: 'boolean' },
    },
    required: ['url'],
  },
  
  extractRequest: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
      mode: { type: 'string', enum: ['fast', 'deep'] },
      maxChars: { type: 'number', minimum: 1000, maximum: 100000 },
    },
    required: ['url'],
  },
  
  researchRequest: {
    type: 'object',
    properties: {
      input: { type: 'string' },
      inputType: { type: 'string', enum: ['url', 'company', 'accountKey'] },
      options: { type: 'object' },
    },
    required: ['input'],
  },
  
  enrichmentQueueRequest: {
    type: 'object',
    properties: {
      canonicalUrl: { type: 'string', format: 'uri' },
      accountKey: { type: 'string' },
      options: { type: 'object' },
    },
    required: ['canonicalUrl'],
  },
  
  competitorResearchRequest: {
    type: 'object',
    properties: {
      accountKey: { type: 'string' },
      canonicalUrl: { type: 'string', format: 'uri' },
      options: { type: 'object' },
    },
  },
};

