import { cn } from '@/lib/utils';

/**
 * The scrollable page body. Every page renders its own (rather than the shell providing one)
 * so that print modals stay siblings of `<main>` — the print stylesheet hides `main` to remove
 * app chrome, and anything nested inside it would be hidden along with it.
 */
export default function PageMain({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        // Bottom padding clears the floating Ctrl+K search button on desktop too — without it
        // the FAB sat on top of the table pagination controls and blocked the next-page arrow.
        'page-enter w-full max-w-[1600px] mx-auto flex-1 p-4 md:p-6 pb-24 md:pb-24',
        className
      )}
    >
      {children}
    </main>
  );
}
