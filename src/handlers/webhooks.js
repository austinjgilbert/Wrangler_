/**
 * Webhook Handlers
 * Manages webhook registration and delivery for async job completions
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

/**
 * Validate URL
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a webhook for job completion notifications
 * POST /webhooks/register
 * Body: { url: string, events: string[], secret?: string, accountKey?: string }
 */
export async function handleRegisterWebhook(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    const { url, events, secret, accountKey } = body;
    
    // Validation
    if (!url || !isValidUrl(url)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Valid webhook URL required',
        {},
        400,
        requestId
      );
    }
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'events array required with at least one event',
        {},
        400,
        requestId
      );
    }
    
    // Validate event types
    const validEvents = [
      'osint.complete',
      'osint.failed',
      'enrichment.complete',
      'enrichment.failed',
      'scan.complete',
      'research.complete',
      'competitor.complete',
    ];
    
    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `Invalid event types: ${invalidEvents.join(', ')}`,
        { validEvents },
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Generate webhook ID
    const webhookId = await generateWebhookId();
    
    // Create webhook document
    const webhookDoc = {
      _type: 'webhook',
      _id: `webhook-${webhookId}`,
      webhookId,
      url,
      events,
      secret: secret || null,
      accountKey: accountKey || null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deliveryCount: 0,
      lastDeliveryAt: null,
      lastError: null,
    };
    
    // Store in Sanity
    await upsertDocument(client, webhookDoc);
    // Sanity mutate does not return { success }; no throw = success

    return createSuccessResponse({
      webhook: {
        webhookId,
        url,
        events,
        accountKey: accountKey || null,
        active: true,
        createdAt: webhookDoc.createdAt,
      },
      registered: true,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to register webhook',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * List registered webhooks
 * GET /webhooks/list?accountKey=...&active=true
 */
export async function handleListWebhooks(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const active = url.searchParams.get('active');
    
    const client = assertSanityConfigured(env);
    
    // Build query
    let query = '*[_type == "webhook"';
    const params = {};
    
    if (accountKey) {
      query += ' && accountKey == $accountKey';
      params.accountKey = accountKey;
    }
    
    if (active !== null) {
      query += ' && active == $active';
      params.active = active === 'true';
    }
    
    query += '] | order(_createdAt desc) { webhookId, url, events, accountKey, active, createdAt, updatedAt, deliveryCount, lastDeliveryAt }';
    
    const webhooks = await groqQuery(client, query, params) || [];
    
    return createSuccessResponse({
      webhooks: webhooks || [],
      count: (webhooks || []).length,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to list webhooks',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Delete a webhook
 * DELETE /webhooks/delete/{webhookId}
 */
export async function handleDeleteWebhook(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured,
  webhookId
) {
  try {
    if (!webhookId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'webhookId required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Check if webhook exists
    const query = `*[_type == "webhook" && webhookId == $webhookId][0]`;
    const result = await groqQuery(client, query, { webhookId });
    const webhook = (result && result.length > 0) ? result[0] : null;
    
    if (!webhook) {
      return createErrorResponse(
        'NOT_FOUND',
        'Webhook not found',
        { webhookId },
        404,
        requestId
      );
    }
    
    // Delete webhook (mark as inactive or delete document)
    const deleteQuery = `*[_type == "webhook" && webhookId == $webhookId][0]._id`;
    const idResult = await groqQuery(client, deleteQuery, { webhookId });
    const docId = (idResult && idResult.length > 0) ? idResult[0] : null;
    
    if (docId) {
      const deleteResult = await client.delete(docId);
      if (deleteResult) {
        return createSuccessResponse({
          deleted: true,
          webhookId,
        }, requestId);
      }
    }
    
    return createErrorResponse(
      'DELETE_ERROR',
      'Failed to delete webhook',
      { webhookId },
      500,
      requestId
    );
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to delete webhook',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Deliver webhook notification (internal function)
 * Called when async jobs complete
 */
export async function deliverWebhook(env, event, payload) {
  try {
    if (!env.SANITY_PROJECT_ID) return; // Sanity not configured, skip webhooks
    
    const sanityModule = await import('../sanity-client.js');
    let client;
    try {
      client = sanityModule.assertSanityConfigured(env);
    } catch (error) {
      // Sanity not configured, skip webhooks
      return;
    }
    
    const { groqQuery } = sanityModule;
    
    // Find active webhooks for this event
    // Note: GROQ doesn't support "in" operator directly, so we check each event
    const query = `*[_type == "webhook" && active == true] {
      webhookId,
      url,
      secret,
      accountKey,
      events,
      deliveryCount,
    }`;
    
    const allWebhooks = await groqQuery(client, query, {}) || [];
    const webhooks = allWebhooks.filter(w => (w.events || []).includes(event));
    
    if (!webhooks || webhooks.length === 0) {
      return; // No webhooks registered for this event
    }
    
    // Filter by accountKey if provided in payload
    const accountKey = payload.accountKey || payload.account?.accountKey;
    const relevantWebhooks = accountKey
      ? webhooks.filter(w => !w.accountKey || w.accountKey === accountKey)
      : webhooks.filter(w => !w.accountKey); // Only global webhooks if no accountKey
    
    // Deliver to each webhook
    const deliveries = await Promise.allSettled(
      relevantWebhooks.map(webhook => deliverToWebhook(env, webhook, event, payload))
    );
    
    // Update delivery stats
    for (let i = 0; i < relevantWebhooks.length; i++) {
      const webhook = relevantWebhooks[i];
      const result = deliveries[i];
      
      if (result.status === 'fulfilled' && result.value.success) {
        await updateWebhookDelivery(env, webhook.webhookId, true, null);
      } else {
        const error = result.status === 'rejected' 
          ? result.reason?.message || 'Unknown error'
          : result.value?.error || 'Delivery failed';
        await updateWebhookDelivery(env, webhook.webhookId, false, error);
      }
    }
    
  } catch (error) {
    console.error('Error delivering webhook:', error);
    // Don't throw - webhook delivery failures shouldn't break the job
  }
}

/**
 * Deliver webhook to a single URL
 */
async function deliverToWebhook(env, webhook, event, payload) {
  try {
    const webhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      webhookId: webhook.webhookId,
      data: payload,
    };
    
    // Add signature if secret is configured
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Website-Scanner-Worker/1.0',
    };
    
    if (webhook.secret) {
      const signature = await generateWebhookSignature(webhookPayload, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }
    
    // Deliver webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return { success: true, status: response.status };
      } else {
        return { 
          success: false, 
          status: response.status, 
          error: `HTTP ${response.status}` 
        };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Update webhook delivery statistics
 */
async function updateWebhookDelivery(env, webhookId, success, error) {
  try {
    if (!env.SANITY_PROJECT_ID) return;
    
    const sanityModule = await import('../sanity-client.js');
    let client;
    try {
      client = sanityModule.assertSanityConfigured(env);
    } catch (error) {
      return;
    }
    
    const { groqQuery, patchDocument } = sanityModule;
    
    // Find webhook document
    const query = `*[_type == "webhook" && webhookId == $webhookId][0]._id`;
    const result = await groqQuery(client, query, { webhookId });
    const docId = (result && result.length > 0 && result[0]) ? result[0] : null;
    
    if (!docId) return;
    
    // Update delivery stats
    const update = {
      deliveryCount: { $inc: 1 },
      lastDeliveryAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    if (!success) {
      update.lastError = error;
    }
    
    await patchDocument(client, docId, update);
    
  } catch (error) {
    console.error('Error updating webhook delivery stats:', error);
  }
}

/**
 * Generate webhook ID
 */
async function generateWebhookId() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate webhook signature for verification
 */
async function generateWebhookSignature(payload, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

