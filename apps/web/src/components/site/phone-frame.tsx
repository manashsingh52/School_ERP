import { cn } from '@schoolos/ui';
import Image from 'next/image';

/**
 * An app screenshot in a phone body. The screenshots are 270 × 584 (CSS px): the image box keeps
 * exactly that shape at every width (the status bar sits above it), so nothing stretches.
 */
export function PhoneFrame({ src, alt, className, priority = false, sizes = '(max-width: 768px) 280px, 300px' }: { src: string; alt: string; className?: string; priority?: boolean; sizes?: string }) {
  return (
    <div className={cn('relative rounded-[2.6rem] bg-neutral-900 p-[7px] shadow-[0_30px_60px_-20px_rgb(10_20_15/0.45),0_0_0_1px_rgb(255_255_255/0.06)_inset] dark:bg-neutral-800', className)}>
      <div className="relative overflow-hidden rounded-[2.15rem] bg-white">
        <div aria-hidden className="relative flex h-7 items-center justify-between bg-white px-5 text-[10px] font-semibold text-neutral-900">
          <span className="figures">9:41</span>
          <span className="absolute top-1.5 left-1/2 h-[17px] w-[32%] -translate-x-1/2 rounded-full bg-neutral-950" />
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-px">{[4, 6, 8, 10].map((h) => <span key={h} className="w-[2px] rounded-sm bg-neutral-900" style={{ height: h }} />)}</span>
            <span className="ml-1 h-[9px] w-[17px] rounded-[3px] border border-neutral-900 p-px"><span className="block h-full w-3/4 rounded-[1px] bg-neutral-900" /></span>
          </span>
        </div>
        <div className="relative aspect-[270/584]">
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.2)_0%,rgb(255_255_255/0)_30%,rgb(255_255_255/0)_72%,rgb(255_255_255/0.05)_100%)]" />
      </div>
      <span aria-hidden className="absolute top-24 -left-[3px] h-10 w-[3px] rounded-l bg-neutral-700" />
      <span aria-hidden className="absolute top-40 -left-[3px] h-14 w-[3px] rounded-l bg-neutral-700" />
      <span aria-hidden className="absolute top-32 -right-[3px] h-16 w-[3px] rounded-r bg-neutral-700" />
    </div>
  );
}
