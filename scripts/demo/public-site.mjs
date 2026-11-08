export const demoOrigin = 'https://demo-doormanager-pro.pages.dev';
export const demoTitle = 'DoorManager Pro · Demo para instaladores y mantenimiento';
export const demoDescription = 'Del aviso al cobro, todo conectado. Prueba la beta de DoorManager Pro: partes, equipos, checks y gestión económica, sin registro y con datos ficticios.';

export function demoBuildTarget(env) {
  let project = false, pages = false;
  try {
    const url = new URL(env.VITE_SUPABASE_URL ?? '');
    project = url.origin === 'https://xlhzyhotzfflemjnqvqn.supabase.co' && url.pathname === '/' && !url.search && !url.hash;
  } catch { /* Missing local or build-time URL is not a demo signal. */ }
  try {
    const host = new URL(env.CF_PAGES_URL ?? '').hostname;
    pages = host === 'demo-doormanager-pro.pages.dev' || host.endsWith('.demo-doormanager-pro.pages.dev');
  } catch { /* Only trust the exact demo project hostname. */ }
  return { enabled: project || pages, preview: Boolean(pages && env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main') };
}

export function demoHeadTags(preview = false) {
  const meta = (name, content, property = false) => ({ tag: 'meta', attrs: { [property ? 'property' : 'name']: name, content }, injectTo: 'head' });
  return [
    meta('description', demoDescription),
    meta('robots', preview ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'),
    { tag: 'link', attrs: { rel: 'canonical', href: demoOrigin + '/' }, injectTo: 'head' },
    meta('og:type', 'website', true), meta('og:locale', 'es_ES', true),
    meta('og:site_name', 'DoorManager Pro', true), meta('og:title', demoTitle, true),
    meta('og:description', demoDescription, true), meta('og:url', demoOrigin + '/', true),
    meta('og:image', demoOrigin + '/demo-share/dmp-beta-social.jpg', true),
    meta('og:image:width', '1200', true), meta('og:image:height', '630', true),
    meta('og:image:alt', 'DoorManager Pro. Del aviso al cobro, todo conectado. Beta pública para instaladores y mantenimiento.', true),
    meta('twitter:card', 'summary_large_image'), meta('twitter:title', demoTitle),
    meta('twitter:description', demoDescription), meta('twitter:image', demoOrigin + '/demo-share/dmp-beta-social.jpg'),
    { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: 'DoorManager Pro', applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      inLanguage: 'es', url: demoOrigin + '/', description: demoDescription,
      image: demoOrigin + '/demo-share/dmp-beta-social.jpg',
      creator: { '@type': 'Person', name: 'Francisco Javier Ena Márquez' },
    }), injectTo: 'head' },
  ];
}

export function demoIndexHtml(html) {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${demoTitle}</title>`)
    .replace('<div id="root"></div>', `<div id="root"><main style="max-width:960px;margin:64px auto;padding:24px;font-family:system-ui;color:#173f47"><p>DOORMANAGER PRO · BETA PÚBLICA</p><h1>Del aviso al cobro, todo conectado.</h1><p>Software de partes y mantenimiento para empresas instaladoras: clientes, equipos, checks y gestión económica.</p><p>Explora una pequeña muestra de DMP con una guía paso a paso, sin registro y con datos ficticios.</p><p role="status">Preparando la demo…</p><noscript><p>Activa JavaScript para entrar en la demo interactiva. Contacto: doormanagerpro@gmail.com.</p></noscript></main></div>`);
}

export function demoRobots(preview = false) {
  return preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /actualizar\n\nSitemap: ${demoOrigin}/sitemap.xml\n`;
}
export const demoSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${demoOrigin}/</loc></url></urlset>\n`;
