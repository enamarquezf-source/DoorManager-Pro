import { describe, expect, it } from 'vitest';
import { isBillingEligibleWithoutOffice, isModernBillingRouting } from './guidedBillingEligibility';

const base = { economic_review_status: 'approved', economic_status: 'pendiente_validacion', office_validation_status: 'pending', warranty: false, billable: true, sale_amount: 100 };

describe('guided billing eligibility 091', () => {
  it('allows approved SAT direct routing without Office validation', () => {
    const workOrder = { ...base, sat_review_status: 'approved', sat_review_destination: 'facturacion' };
    expect(isModernBillingRouting(workOrder)).toBe(true);
    expect(isBillingEligibleWithoutOffice(workOrder)).toBe(true);
  });

  it('allows approved SAT to Comercial only after Commercial approval', () => {
    const pending = { ...base, sat_review_status: 'approved', sat_review_destination: 'comercial', commercial_review_status: 'pending' };
    const approved = { ...pending, commercial_review_status: 'approved' };
    expect(isBillingEligibleWithoutOffice(pending)).toBe(false);
    expect(isBillingEligibleWithoutOffice(approved)).toBe(true);
  });

  it('preserves the legacy Office route', () => {
    const workOrder = { ...base, economic_review_status: 'not_started', economic_status: 'pendiente_facturar', office_validation_status: 'validated', sat_review_status: 'not_started' };
    expect(isModernBillingRouting(workOrder)).toBe(false);
    expect(isBillingEligibleWithoutOffice(workOrder)).toBe(true);
  });

  it('rejects warranty, non-billable and unapproved work orders', () => {
    expect(isBillingEligibleWithoutOffice({ ...base, sat_review_status: 'pending', sat_review_destination: null })).toBe(false);
    expect(isBillingEligibleWithoutOffice({ ...base, warranty: true, sale_amount: 0, sat_review_status: 'approved', sat_review_destination: 'facturacion' })).toBe(false);
    expect(isBillingEligibleWithoutOffice({ ...base, billable: false, sat_review_status: 'approved', sat_review_destination: 'facturacion' })).toBe(false);
  });

  it('allows warranty work orders when they have a positive approved sale', () => {
    expect(isBillingEligibleWithoutOffice({ ...base, warranty: true, sale_amount: 25, sat_review_status: 'approved', sat_review_destination: 'facturacion' })).toBe(true);
    expect(isBillingEligibleWithoutOffice({ ...base, warranty: true, sale_amount: 0, sat_review_status: 'approved', sat_review_destination: 'facturacion' })).toBe(false);
  });

  it('freezes pending and returned modern reviews, including old positive sales', () => {
    const modern = { ...base, sat_review_status: 'approved', sat_review_destination: 'facturacion' };
    expect(isBillingEligibleWithoutOffice(modern)).toBe(true);
    expect(isBillingEligibleWithoutOffice({ ...modern, economic_review_status: 'pending' })).toBe(false);
    expect(isBillingEligibleWithoutOffice({ ...modern, economic_review_status: 'returned', sale_amount: 100 })).toBe(false);
    expect(isBillingEligibleWithoutOffice({ ...modern, economic_review_status: 'returned', office_validation_status: 'validated' })).toBe(false);
    expect(isBillingEligibleWithoutOffice({ ...modern, economic_review_status: 'approved' })).toBe(true);
  });
});
