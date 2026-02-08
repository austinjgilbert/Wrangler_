/**
 * Retry Utility
 * Retry operations with exponential backoff
 */

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry (async)
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {number} options.backoffFactor - Backoff multiplier (default: 2)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried (default: retry all)
 * @returns {Promise<any>} - Function result
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = () => true, // Retry all errors by default
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
      const finalDelay = delay + jitter;
      
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }
  
  throw lastError;
}

/**
 * Retry fetch with exponential backoff
 * @param {string|Request} resource - Resource to fetch
 * @param {RequestInit} options - Fetch options
 * @param {object} retryOptions - Retry options
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithRetry(resource, options = {}, retryOptions = {}) {
  const shouldRetry = (error, attempt) => {
    // Retry on network errors or 5xx status codes
    if (error instanceof TypeError) {
      return true; // Network error
    }
    if (error.status >= 500 && error.status < 600) {
      return true; // Server error
    }
    if (error.status === 429) {
      return attempt < 2; // Retry rate limits up to 2 times
    }
    return false;
  };

  return retryWithBackoff(
    async () => {
      const response = await fetch(resource, options);
      
      // Throw error for 5xx status codes
      if (response.status >= 500 && response.status < 600) {
        const error = new Error(`Server error: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      
      // Throw error for rate limits
      if (response.status === 429) {
        const error = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      }
      
      return response;
    },
    {
      ...retryOptions,
      shouldRetry,
    }
  );
}

/**
 * Retry Sanity operation with exponential backoff
 * @param {Function} operation - Sanity operation (async)
 * @param {object} retryOptions - Retry options
 * @returns {Promise<any>} - Operation result
 */
export async function retrySanityOperation(operation, retryOptions = {}) {
  const shouldRetry = (error, attempt) => {
    // Retry on network errors
    if (error instanceof TypeError) {
      return true;
    }
    
    // Retry on 5xx errors
    if (error.message && error.message.includes('5')) {
      return true;
    }
    
    // Retry on rate limit errors
    if (error.message && error.message.includes('429')) {
      return attempt < 2;
    }
    
    // Don't retry 4xx errors (except 429)
    if (error.message && error.message.includes('4')) {
      return false;
    }
    
    return true; // Retry other errors
  };

  return retryWithBackoff(operation, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    shouldRetry,
    ...retryOptions,
  });
}

