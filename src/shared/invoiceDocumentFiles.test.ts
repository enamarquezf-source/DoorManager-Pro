import { describe, expect, it } from 'vitest';
import { invoiceDocumentExtension } from './invoiceDocumentFiles';

describe('invoice attachment validation', () => {
  it.each([['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])('accepts %s', (type, extension) => {
    expect(invoiceDocumentExtension({ type, size: 100 })).toBe(extension);
  });
  it.each([0, 10485761])('rejects invalid size %s before upload', (size) => {
    expect(() => invoiceDocumentExtension({ type: 'application/pdf', size })).toThrow('10 MB');
  });
  it('rejects executable and HTML files', () => {
    for (const type of ['text/html', 'application/x-msdownload']) expect(() => invoiceDocumentExtension({ type, size: 100 })).toThrow('PDF');
  });
});
