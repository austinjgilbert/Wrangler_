/**
 * LinkedIn Profile Capture Endpoint
 *
 * POST /extension/linkedin-capture
 *
 * Receives DOM-extracted LinkedIn profile data from the Chrome extension,
 * stores/updates the person document in Sanity, and queues async AI enrichment.
 *
 * Flow:
 *   Extension DOM extraction → this endpoint → person doc upsert → AI enrichment queue
 */

import { createSuccessResponse, createErrorResponse, safeParseJson } from '../utils/response.js';
import { generatePersonKey } from '../services/enhanced-storage-service.js';

interface LinkedInExperience {
  title: string;
  company: string;
  duration?: string;
  description?: string;
  isCurrent?: boolean;
}

interface LinkedInEducation {
  school: string;
  degree?: string;
  field?: string;
  duration?: string;
}

interface LinkedInCaptureBody {
  profileUrl: string;
  capturedAt: string;
  source: 'extension_dom' | 'worker_scrape' | 'manual';
  profile: {
    name: string;
    headline?: string;
    location?: string;
    about?: string;
    experience?: LinkedInExperience[];
    education?: LinkedInEducation[];
    skills?: string[];
    certifications?: { name: string; issuer?: string; date?: string }[];
    languages?: { name: string; proficiency?: string }[];
    volunteer?: { organization: string; role?: string; duration?: string; description?: string }[];
    publications?: { title: string; publisher?: string; date?: string; url?: string }[];
    connections?: number;
    followers?: number;
    openToWork?: boolean;
    profileImage?: string;
    recentActivity?: string[];
  };
}

// Person key generation uses the shared generatePersonKey() from enhanced-storage-service.js
// to ensure consistent hashing across all person creation paths (extension capture, enrichment, etc.)

/**
 * Extract the LinkedIn username slug from a profile URL.
 * e.g., "https://www.linkedin.com/in/jane-smith-123/" → "jane-smith-123"
 */
function extractLinkedInSlug(url: string): string | null {
  try {
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    return match ? match[1].replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Try to link a person to an existing account by matching their current company domain.
 */
async function findRelatedAccountKey(
  groqQuery: Function,
  client: any,
  profile: LinkedInCaptureBody['profile']
): Promise<string | null> {
  const company = profile.experience?.find(e => e.isCurrent)?.company || '';
  if (!company) return null;

  try {
    // Search for accounts matching the company name
    const query = `*[_type == "account" && (companyName match $company || domain match $companyLower)][0]{ accountKey }`;
    const result = await groqQuery(client, query, {
      company: `${company}*`,
      companyLower: company.toLowerCase().replace(/\s+/g, '').replace(/,?\s*(inc|llc|ltd|corp)\.?$/i, ''),
    });
    return result?.accountKey || null;
  } catch {
    return null;
  }
}

/**
 * Build the text corpus for AI analysis from the person's own words.
 */
function buildAnalysisCorpus(profile: LinkedInCaptureBody['profile']): string {
  const parts: string[] = [];

  if (profile.headline) {
    parts.push(`Headline: ${profile.headline}`);
  }
  if (profile.about) {
    parts.push(`About:\n${profile.about}`);
  }
  if (profile.experience?.length) {
    const expText = profile.experience
      .filter(e => e.description)
      .map(e => `${e.title} at ${e.company}:\n${e.description}`)
      .join('\n\n');
    if (expText) parts.push(`Experience:\n${expText}`);
  }
  if (profile.skills?.length) {
    parts.push(`Skills: ${profile.skills.join(', ')}`);
  }
  if (profile.volunteer?.length) {
    const volText = profile.volunteer
      .filter(v => v.description)
      .map(v => `${v.role || 'Volunteer'} at ${v.organization}: ${v.description}`)
      .join('\n');
    if (volText) parts.push(`Volunteer:\n${volText}`);
  }
  if (profile.recentActivity?.length) {
    parts.push(`Recent Activity:\n${profile.recentActivity.slice(0, 5).join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Queue AI enrichment for a person profile.
 * Non-blocking — fires and forgets. Results written back to person doc asynchronously.
 */
async function queueAIEnrichment(
  groqQuery: Function,
  patchDocument: Function,
  client: any,
  personId: string,
  corpus: string,
  env: any
): Promise<void> {
  // Skip if corpus is too thin for meaningful analysis
  if (corpus.length < 100) return;

  try {
    const { callLlm } = await import('../lib/llm.ts');

    const systemPrompt = `You are a sales intelligence analyst. Analyze LinkedIn profiles and return structured JSON for sales teams. Return ONLY valid JSON, no markdown fences.`;

    const userPrompt = `Analyze this LinkedIn profile for sales intelligence. The person is a potential buyer or influencer at a target account.

Profile data:
${corpus}

Return a JSON object with:
- tone: string[] — 3-5 adjectives describing their communication style based on their own words
- triggers: string[] — topics/themes that excite them (from their own words)
- focus: string — one sentence on what they're currently focused on
- careerTrajectory: string — their career path pattern (e.g., "IC engineer → tech lead → VP, startup → enterprise")
- sellingAngle: string — how to approach them in a sales conversation
- communicationStyle: string — how they prefer to communicate based on their writing
- interests: string[] — professional interests beyond their current role
- summary: string — 2-3 sentence profile summary for a sales rep`;

    const result = await callLlm(env, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 1000, temperature: 0.3 });

    const response = result?.content;
    if (!response) return;

    // Parse the LLM response
    let analysis: any;
    try {
      // Strip markdown code fences if present
      const cleaned = response.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI enrichment response for', personId);
      return;
    }

    // Write analysis back to person doc
    await patchDocument(client, personId, {
      set: {
        profileAnalysis: {
          tone: Array.isArray(analysis.tone) ? analysis.tone.slice(0, 5) : [],
          triggers: Array.isArray(analysis.triggers) ? analysis.triggers.slice(0, 8) : [],
          focus: String(analysis.focus || '').slice(0, 500),
          careerTrajectory: String(analysis.careerTrajectory || '').slice(0, 500),
          sellingAngle: String(analysis.sellingAngle || '').slice(0, 500),
          communicationStyle: String(analysis.communicationStyle || '').slice(0, 500),
          interests: Array.isArray(analysis.interests) ? analysis.interests.slice(0, 10) : [],
          summary: String(analysis.summary || '').slice(0, 1000),
          analyzedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    // Non-blocking — log and continue
    console.error('AI enrichment failed for', personId, ':', err?.message);
  }
}

/**
 * Main handler for POST /extension/linkedin-capture
 */
export async function handleLinkedInCapture(
  request: Request,
  requestId: string,
  env: any
): Promise<Response> {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;

    // Validate required fields
    if (!body?.profileUrl || !body?.profile?.name) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'profileUrl and profile.name are required',
        {},
        400,
        requestId
      );
    }

    // Validate it's actually a LinkedIn URL
    if (!body.profileUrl.includes('linkedin.com/in/')) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'profileUrl must be a LinkedIn profile URL (/in/)',
        {},
        400,
        requestId
      );
    }

    // Initialize Sanity client
    const { initSanityClient, groqQuery, upsertDocument, patchDocument } = await import(
      '../sanity-client.js'
    );
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 500, requestId);
    }

    // Generate person key from LinkedIn URL — uses shared function for consistent hashing
    const personKey = await generatePersonKey(body.profileUrl, body.profile.name);
    if (!personKey) {
      return createErrorResponse(
        'KEY_ERROR',
        'Could not generate person key',
        {},
        500,
        requestId
      );
    }

    const personId = `person-${personKey}`;
    const slug = extractLinkedInSlug(body.profileUrl);
    const profile = body.profile;
    const now = new Date().toISOString();

    // Check for existing person
    const existing = await groqQuery(
      client,
      `*[_type == "person" && _id == $id][0]{ _id, updatedAt }`,
      { id: personId }
    );

    // Try to find related account
    const relatedAccountKey = await findRelatedAccountKey(groqQuery, client, profile);

    // Build the person document
    const personDoc: Record<string, any> = {
      _type: 'person',
      _id: personId,
      personKey,
      name: profile.name,
      linkedInUrl: body.profileUrl,
      linkedInSlug: slug,
      headline: profile.headline || null,
      currentTitle: profile.experience?.find(e => e.isCurrent)?.title || profile.headline?.split(' at ')[0] || null,
      currentCompany: profile.experience?.find(e => e.isCurrent)?.company || profile.headline?.split(' at ')[1] || null,
      location: profile.location || null,
      about: profile.about || null,
      experience: (profile.experience || []).map(e => ({
        title: e.title,
        company: e.company,
        duration: e.duration || null,
        description: e.description || null,
        isCurrent: e.isCurrent || false,
      })),
      education: (profile.education || []).map(e => ({
        school: e.school,
        degree: e.degree || null,
        field: e.field || null,
        duration: e.duration || null,
      })),
      skills: (profile.skills || []).slice(0, 50),
      certifications: profile.certifications || [],
      languages: profile.languages || [],
      volunteer: profile.volunteer || [],
      publications: profile.publications || [],
      connections: profile.connections || null,
      followers: profile.followers || null,
      openToWork: profile.openToWork || false,
      profileImageUrl: profile.profileImage || null,
      capturedAt: body.capturedAt || now,
      captureSource: body.source || 'extension_dom',
      updatedAt: now,
    };

    // Add account link if found
    if (relatedAccountKey) {
      personDoc.relatedAccountKey = relatedAccountKey;
    }

    // Preserve createdAt on existing docs
    if (!existing) {
      personDoc.createdAt = now;
    }

    // Upsert the person document
    await upsertDocument(client, personDoc);

    // Build corpus and queue AI enrichment (non-blocking)
    const corpus = buildAnalysisCorpus(profile);
    if (corpus.length >= 100) {
      // Fire and forget — don't await
      queueAIEnrichment(groqQuery, patchDocument, client, personId, corpus, env).catch(err => {
        console.error('AI enrichment queue error:', err?.message);
      });
    }

    // ── Activity event: LinkedIn capture ────────────────────────────
    const { emitActivityEvent } = await import('../lib/sanity.ts');
    emitActivityEvent(env, {
      eventType: 'capture',
      status: 'completed',
      source: 'extension',
      accountKey: relatedAccountKey || null,
      category: 'capture',
      message: `Captured LinkedIn: ${profile.name}${profile.headline ? ', ' + profile.headline.split(' at ')[0] : ''}`,
      data: {
        personName: profile.name,
        personId,
        personKey,
        domain: profile.experience?.find((e: any) => e.isCurrent)?.company || null,
        isNew: !existing,
      },
      idempotencyKey: `linkedin.capture.${personKey}`,
    }).catch((err: any) => {
      console.error('LinkedIn capture: activity event failed (non-blocking):', err?.message);
    });

    return createSuccessResponse(
      {
        personKey,
        personId,
        isNew: !existing,
        relatedAccountKey: relatedAccountKey || null,
        aiEnrichmentQueued: corpus.length >= 100,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse(
      'LINKEDIN_CAPTURE_ERROR',
      error.message || 'Failed to capture LinkedIn profile',
      {},
      500,
      requestId
    );
  }
}
