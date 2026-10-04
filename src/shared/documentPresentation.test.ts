import { describe,it,expect } from 'vitest';
import { expiryState,documentUrl } from './documentPresentation';
describe('document presentation',()=>{
 it('rejects unsafe URL schemes',()=>{expect(documentUrl({url:'javascript:alert(1)'})).toBeNull();expect(documentUrl({url:'data:text/html,test'})).toBeNull();expect(documentUrl({url:'https://example.com/a.pdf'})).toBe('https://example.com/a.pdf');});
 it('classifies expiry dates including the boundary and empty values',()=>{expect(expiryState(null,'2026-10-04')).toBe('Sin caducidad');expect(expiryState('2026-10-03','2026-10-04')).toBe('Caducado');expect(expiryState('2026-10-04','2026-10-04')).toBe('Próximo a vencer');expect(expiryState('2026-11-03','2026-10-04')).toBe('Próximo a vencer');expect(expiryState('2026-11-04','2026-10-04')).toBe('Vigente');});
});
