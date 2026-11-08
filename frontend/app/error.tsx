'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="m-4 border border-destructive/40 bg-destructive/10 p-10 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-destructive">Signal interrupted</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        The observer link dropped while loading this sector. Retry to re-establish the feed.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 cursor-pointer border border-stone-200/40 bg-stone-100/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-900 transition-colors duration-200 hover:bg-stone-100 hover:text-stone-900-foreground"
      >
        Retry connection
      </button>
    </div>
  );
}
