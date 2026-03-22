/**
 * AccountSelector — Searchable dropdown for switching between accounts.
 *
 * Data flow:
 * 1. Worker GET /operator/console/snapshot → data.entities.accounts (SnapshotAccount[])
 * 2. transformSnapshotAccounts() → Account[]
 * 3. sortAccountsForSelector() → sorted by completeness, then score
 * 4. User selects → onSelect(account) → CommandCenter switches context
 *
 * Performance: 60s stale-while-revalidate cache, client-side filter, max 50 visible.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../../lib/adapters';
import { getAccountDisplayName } from '../../lib/account-dedupe';
import {
  transformSnapshotAccounts,
  sortAccountsForSelector,
  workerGet,
  getCached,
  setCache,
  type SnapshotAccount,
} from '../../lib/adapters';

// ─── Props ──────────────────────────────────────────────────────────────

export interface AccountSelectorProps {
  selectedAccount: Account | null;
  onSelect: (account: Account) => void;
  onClear: () => void;
}

const MAX_VISIBLE = 50;

// ─── Component ──────────────────────────────────────────────────────────

export function AccountSelector({ selectedAccount, onSelect, onClear }: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = useCallback(async () => {
    const cached = getCached<Account[]>('accounts');
    if (cached) {
      setAccounts(cached.data);
      if (cached.fresh) return;
    }

    setLoading(!cached);
    setError(null);

    try {
      const response = await workerGet<{
        entities: { accounts: SnapshotAccount[] };
      }>('/operator/console/snapshot');
      const raw = response.data?.entities?.accounts ?? [];
      const transformed = transformSnapshotAccounts(raw);
      const sorted = sortAccountsForSelector(transformed);
      setAccounts(sorted);
      setCache('accounts', sorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load accounts';
      setError(msg);
      if (!cached) setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts.slice(0, MAX_VISIBLE);
    const term = search.trim().toLowerCase();
    return accounts
      .filter(
        (a: Account) =>
          a.companyName.toLowerCase().includes(term) ||
          a.rootDomain.toLowerCase().includes(term) ||
          a.accountKey.toLowerCase().includes(term),
      )
      .slice(0, MAX_VISIBLE);
  }, [accounts, search]);

  const handleSelect = useCallback(
    (account: Account) => {
      onSelect(account);
      setIsOpen(false);
      setSearch('');
    },
    [onSelect],
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    <div className="account-selector" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {selectedAccount ? (
        <div className="account-selector__selected">
          <button className="account-selector__trigger" onClick={handleOpen}>
            <span className="account-selector__company">{getAccountDisplayName(selectedAccount)}</span>
            <span className="account-selector__domain">{selectedAccount.rootDomain}</span>
            {selectedAccount.opportunityScore !== undefined && (
              <span
                className="account-selector__score"
                style={{
                  color: selectedAccount.opportunityScore >= 70 ? '#408020' :
                         selectedAccount.opportunityScore >= 40 ? '#d97706' : '#a0a0a8',
                }}
              >
                {selectedAccount.opportunityScore}
              </span>
            )}
            <span className="account-selector__chevron">▾</span>
          </button>
          <button className="account-selector__clear" onClick={onClear} aria-label="Back to briefing">
            ← Briefing
          </button>
        </div>
      ) : (
        <button className="account-selector__trigger account-selector__trigger--empty" onClick={handleOpen}>
          <span className="account-selector__placeholder">Select account...</span>
          <span className="account-selector__count">
            {loading ? '...' : `${accounts.length} accounts`}
          </span>
          <span className="account-selector__chevron">▾</span>
        </button>
      )}

      {isOpen && (
        <div className="account-selector__dropdown">
          <div className="account-selector__search-wrap">
            <input
              ref={inputRef}
              type="text"
              className="account-selector__search"
              placeholder="Search by name, domain, or key..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="account-selector__list">
            {error && (
              <div className="account-selector__error">
                {error}
                <button onClick={fetchAccounts} className="account-selector__retry">Retry</button>
              </div>
            )}

            {!error && filtered.length === 0 && (
              <div className="account-selector__empty">
                {search ? 'No accounts match' : loading ? 'Loading...' : 'No accounts found'}
              </div>
            )}

            {filtered.map((account: Account) => (
              <button
                key={account.accountKey}
                className={`account-selector__item ${
                  selectedAccount?.accountKey === account.accountKey
                    ? 'account-selector__item--selected'
                    : ''
                }`}
                onClick={() => handleSelect(account)}
              >
                <div className="account-selector__item-main">
                  <span className="account-selector__item-name">{getAccountDisplayName(account)}</span>
                  <span className="account-selector__item-domain">{account.rootDomain}</span>
                </div>
                <div className="account-selector__item-meta">
                  {account.hot && <span className="account-selector__item-hot">🔥</span>}
                  {account.opportunityScore !== undefined && (
                    <span className="account-selector__item-score">{account.opportunityScore}</span>
                  )}
                </div>
              </button>
            ))}

            {accounts.length > MAX_VISIBLE && !search && (
              <div className="account-selector__overflow">
                Showing {MAX_VISIBLE} of {accounts.length} — type to filter
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
