import { describe, expect, it } from 'vitest';
import { resolveOfflineSectionId } from './checksService';

const sections = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Sistema hidráulico', slug: 'hidraulico', check_template_items: [] },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Sistema eléctrico', slug: 'automatizacion', check_template_items: [] },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Labio y plataforma', slug: 'labio-plataforma', check_template_items: [] },
  { id: '44444444-4444-4444-8444-444444444444', title: 'Estado general', slug: 'funcionamiento', check_template_items: [] },
];

describe('offline check section resolution', () => {
  it.each([
    ['hidraulico', sections[0].id],
    ['automatizacion', sections[1].id],
    ['labio-plataforma', sections[2].id],
    ['funcionamiento', sections[3].id],
  ])('resuelve el slug legacy %s a la sección persistida', (legacy, expected) => {
    expect(resolveOfflineSectionId(sections, { sectionId: legacy }, legacy)).toBe(expected);
  });

  it('prefiere el título persistido y no fabrica una sección ante una correspondencia ambigua', () => {
    expect(resolveOfflineSectionId(sections, { sectionTitle: 'Sistema hidráulico' }, 'otro')).toBe(sections[0].id);
    expect(resolveOfflineSectionId([{ id: sections[0].id, title: 'Sistema' }, { id: sections[1].id, title: 'Sistema' }], { sectionTitle: 'Sistema' })).toBeNull();
  });
});
