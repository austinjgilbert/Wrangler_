/**
 * Techstack adapter — transforms raw technology stack data for UI display.
 */

import type { Account } from './types';

export interface TechCategory {
  category: string;
  technologies: string[];
  count: number;
}

/**
 * Transform an account's technologyStack into sorted categories.
 */
export function transformTechStack(account: Account): TechCategory[] {
  const stack = account.technologyStack;
  if (!stack || typeof stack !== 'object') return [];

  return Object.entries(stack)
    .map(([category, technologies]) => ({
      category,
      technologies: Array.isArray(technologies) ? technologies : [],
      count: Array.isArray(technologies) ? technologies.length : 0,
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total technology count across all categories.
 */
export function getTechCount(account: Account): number {
  const stack = account.technologyStack;
  if (!stack || typeof stack !== 'object') return 0;

  return Object.values(stack).reduce(
    (sum, techs) => sum + (Array.isArray(techs) ? techs.length : 0),
    0,
  );
}
