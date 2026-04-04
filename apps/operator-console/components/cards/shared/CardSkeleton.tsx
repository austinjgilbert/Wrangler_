export function CardSkeleton() {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        .skeleton-bar {
          animation: shimmer 2s infinite;
        }
      `}</style>

      <div className="skeleton-bar h-4 bg-slate-700 rounded mb-3 w-3/4" />
      <div className="skeleton-bar h-3 bg-slate-700 rounded mb-2 w-full" />
      <div className="skeleton-bar h-3 bg-slate-700 rounded w-5/6" />
    </div>
  );
}
