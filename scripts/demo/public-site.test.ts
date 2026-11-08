import { expect, it } from 'vitest';
import { demoBuildTarget, demoHeadTags, demoIndexHtml, demoOrigin, demoRobots, demoSitemap } from './public-site.mjs';

it('recognizes the demo build despite missing or whitespace-padded database variables', () => {
  expect(demoBuildTarget({ VITE_SUPABASE_URL: ' https://xlhzyhotzfflemjnqvqn.supabase.co/\n' }).enabled).toBe(true);
  expect(demoBuildTarget({ CF_PAGES_URL: 'https://abc.demo-doormanager-pro.pages.dev', CF_PAGES_BRANCH: 'main' })).toEqual({ enabled: true, preview: false });
  expect(demoBuildTarget({ CF_PAGES_URL: 'https://abc.doormanager-pro.pages.dev' }).enabled).toBe(false);
  expect(demoBuildTarget({ CF_PAGES_URL: 'https://demo-doormanager-pro.pages.dev.attacker.test' }).enabled).toBe(false);
  expect(demoBuildTarget({ VITE_SUPABASE_URL: 'https://xlhzyhotzfflemjnqvqn.supabase.co/path' }).enabled).toBe(false);
});
it('publishes discoverable root metadata without listing protected routes', () => {
  const tags = demoHeadTags();
  expect(tags.find(t => t.attrs.property === 'og:image')?.attrs.content).toBe(`${demoOrigin}/demo-share/dmp-beta-social.jpg`);
  expect(tags.find(t => t.attrs.rel === 'canonical')?.attrs.href).toBe(`${demoOrigin}/`);
  expect(demoRobots()).toContain(`Sitemap: ${demoOrigin}/sitemap.xml`);
  expect(demoRobots()).toContain('Disallow: /app');
  expect(demoSitemap).toContain(`<loc>${demoOrigin}/</loc>`);
  expect(demoSitemap).not.toContain('/app');
  const html = demoIndexHtml('<html><head><title>DoorManager Pro</title></head><body><div id="root"></div></body></html>');
  expect(html).toContain('Software de partes y mantenimiento');
  expect(html).toContain('<noscript>');
  const structured = tags.find(t => t.attrs.type === 'application/ld+json');
  expect(JSON.parse(structured!.children!)).not.toHaveProperty('aggregateRating');
});
it('keeps non-production previews out of search indexing', () => {
  expect(demoBuildTarget({ CF_PAGES_URL: 'https://test.demo-doormanager-pro.pages.dev', CF_PAGES_BRANCH: 'feature' }).preview).toBe(true);
  expect(demoHeadTags(true).find(t => t.attrs.name === 'robots')?.attrs.content).toBe('noindex,nofollow');
  expect(demoRobots(true)).toBe('User-agent: *\nDisallow: /\n');
});
