/**
 * Whisper transcription tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleWhisperTranscribeTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'whisperTranscribe');
  if (errorResponse) return errorResponse;

  if (body.action !== 'transcribe') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported whisperTranscribe action',
      { action: body.action },
      400,
      requestId
    );
  }

  return buildToolSuccess(requestId, body, {
    transcript: 'Transcript placeholder',
    audioUrl: body.input?.audioUrl || null,
    durationSec: 0,
  });
}
