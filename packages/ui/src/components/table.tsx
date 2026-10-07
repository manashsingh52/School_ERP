import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Skeleton } from './surface';

/** Real <table> markup for accessibility (docs/07 §5). */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-body', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-surface', className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 border-b border-border px-4 text-left align-middle text-caption font-medium text-fg-tertiary',
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, interactive, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-0',
        interactive && 'cursor-pointer transition-colors duration-[120ms] hover:bg-hover focus-visible:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-11 px-4 align-middle text-fg', className)} {...props} />;
}

export function TableSkeleton({ rows = 8, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TR key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <TD key={c}>
              <Skeleton className={cn('h-4', c === 0 ? 'w-44' : 'w-16')} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const fmt = new Intl.NumberFormat('en-IN');
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-small text-fg-secondary">
      <span className="tabular">
        {fmt.format(from)}–{fmt.format(to)} of {fmt.format(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
