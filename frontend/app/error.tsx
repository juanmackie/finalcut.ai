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
        className="mt-4 cursor-pointer border border-primary/40 bg-primary/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
      >
        Retry connection
      </button>
    </div>
  );
}
