type TransferAccount = { treasury_account_id: string; currency_code: string; active: boolean };

export function compatibleTransferAccounts<T extends TransferAccount>(accounts: T[], originId: string): T[] {
  const origin = accounts.find((account) => account.treasury_account_id === originId && account.active);
  return origin ? accounts.filter((account) => account.active && account.treasury_account_id !== originId && account.currency_code === origin.currency_code) : [];
}
