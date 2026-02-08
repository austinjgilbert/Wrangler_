/**
 * Environment validation helpers.
 * Assumption: keep validation minimal and fail fast on required secrets.
 */

export type EnvValidationResult = {
  ok: boolean;
  missing: string[];
  message: string;
};

export function getSanityToken(env: any) {
  return env.SANITY_TOKEN || env.SANITY_API_TOKEN || null;
}

export function validateBaseEnv(env: any): EnvValidationResult {
  const missing: string[] = [];
  if (!env.SANITY_PROJECT_ID) missing.push('SANITY_PROJECT_ID');
  if (!getSanityToken(env)) missing.push('SANITY_TOKEN');

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length === 0
      ? 'ok'
      : `Missing required env vars: ${missing.join(', ')}`,
  };
}

export function assertBaseEnv(env: any) {
  const result = validateBaseEnv(env);
  if (!result.ok) {
    const error = new Error(result.message);
    (error as any).code = 'ENV_NOT_CONFIGURED';
    (error as any).details = { missing: result.missing };
    throw error;
  }
}
