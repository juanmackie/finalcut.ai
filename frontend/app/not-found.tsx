import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="m-4 border border-border/70 bg-card/50 p-10 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">Sector not found</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        No identity or transmission exists at this coordinate.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block cursor-pointer border border-primary/40 bg-primary/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
      >
        Return to mainline
      </Link>
    </div>
  );
}
