import { expect, it } from 'vitest';
import { compatibleTransferAccounts } from './transferAccounts';

it('offers only a different active account in the origin currency', () => {
  const accounts = [
    { treasury_account_id: 'origin', currency_code: 'EUR', active: true },
    { treasury_account_id: 'cash', currency_code: 'EUR', active: true },
    { treasury_account_id: 'inactive', currency_code: 'EUR', active: false },
    { treasury_account_id: 'foreign', currency_code: 'USD', active: true },
  ];
  expect(compatibleTransferAccounts(accounts, 'origin').map((account) => account.treasury_account_id)).toEqual(['cash']);
  expect(compatibleTransferAccounts(accounts, 'inactive')).toEqual([]);
  expect(compatibleTransferAccounts(accounts, '')).toEqual([]);
});
