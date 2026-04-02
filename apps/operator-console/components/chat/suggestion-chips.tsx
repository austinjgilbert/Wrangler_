'use client';

import { Sparkles } from 'lucide-react';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (!suggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(suggestion)}
          className="pill flex items-center gap-1.5 text-xs transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          {suggestion}
        </button>
      ))}
    </div>
  );
}
