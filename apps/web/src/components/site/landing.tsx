import { FeatureBento } from './bento';
import { FinalCta, Timeline } from './closing';
import { FeeDemo } from './fee-demo';
import { Hero } from './hero';
import { SiteShell, siteMode } from './site-shell';
import { TrustShowcase } from './trust';

/** The public website's home page. */
export function Landing() {
  const mode = siteMode();
  return (
    <SiteShell>
      <Hero mode={mode} />
      <FeeDemo />
      <FeatureBento />
      <TrustShowcase />
      <Timeline />
      <FinalCta mode={mode} />
    </SiteShell>
  );
}
