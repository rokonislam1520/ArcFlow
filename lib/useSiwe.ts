'use client';
/**
 * SIWE from the client: fetch a nonce, ask the wallet to sign, verify server-side.
 *
 * The signature request is a real `personal_sign`, so MetaMask opens and shows
 * the user exactly what they are agreeing to. Nothing here moves funds — the
 * message says so explicitly, because a signature prompt with no explanation is
 * how people get phished.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from './WalletProvider';
import { SIWE_STATEMENT, formatSiweMessage, type SiweFields } from './siwe';

export type SiweStatus =
  | 'unknown' // still checking for an existing session
  | 'signed-out'
  | 'awaiting-signature' // prompt is open in the wallet
  | 'verifying' // signature submitted, server checking
  | 'signed-in';

export interface SiweState {
  status: SiweStatus;
  /** Address the session belongs to, lowercased. */
  address: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export function useSiwe(): SiweState {
  const { wallet, address, chainId } = useWallet();
  const [status, setStatus] = useState<SiweStatus>('unknown');
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Addresses already offered the automatic prompt this page load.
   *
   * Sign-in is prompted once per connected address, not once per render. A
   * declined signature must not immediately re-open the wallet: that is
   * indistinguishable from a phishing site badgering for a signature, and it
   * would leave no way to browse balances without signing.
   */
  const autoPrompted = useRef(new Set<string>());

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Restore an existing session on load so a reload does not demand a new
  // signature. Signing repeatedly for no reason trains users to click through
  // prompts without reading them.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/siwe/session', { credentials: 'same-origin' });
        const data = await res.json();
        if (!mounted.current) return;
        if (data?.authenticated) {
          setSessionAddress(String(data.address).toLowerCase());
          setStatus('signed-in');
        } else {
          setStatus('signed-out');
        }
      } catch {
        if (mounted.current) setStatus('signed-out');
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/siwe/session', { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // Even if the call fails, drop local state: the user asked to sign out.
    }
    if (!mounted.current) return;
    setSessionAddress(null);
    setStatus('signed-out');
    setError(null);
  }, []);

  // A session belongs to one address. If the wallet switches accounts, the old
  // session no longer describes who is using the app, so end it rather than
  // letting the UI imply the new account is authenticated.
  useEffect(() => {
    if (status !== 'signed-in' || !sessionAddress) return;
    if (!address) {
      void signOut();
      return;
    }
    if (address.toLowerCase() !== sessionAddress) void signOut();
  }, [address, sessionAddress, status, signOut]);

  const signIn = useCallback(async () => {
    if (!wallet || !address || chainId === null) {
      setError('Connect a wallet first.');
      return;
    }

    setError(null);
    try {
      // 1. Nonce, bound to this browser's session cookie.
      const nonceRes = await fetch('/api/siwe/nonce', { credentials: 'same-origin' });
      if (!nonceRes.ok) throw new Error('Could not start sign-in.');
      const { nonce } = await nonceRes.json();
      if (typeof nonce !== 'string' || !nonce) throw new Error('Invalid nonce.');

      const issuedAt = new Date();
      const fields: SiweFields = {
        domain: window.location.host,
        address: address as `0x${string}`,
        statement: SIWE_STATEMENT,
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expirationTime: new Date(issuedAt.getTime() + 10 * 60 * 1000).toISOString(),
      };

      const message = formatSiweMessage(fields);

      // 2. Real signature prompt in the wallet.
      setStatus('awaiting-signature');
      const signature = (await wallet.provider.request({
        method: 'personal_sign',
        // personal_sign takes [message, address] — reversing these silently
        // fails on some wallets and succeeds on others.
        params: [message, address],
      } as Parameters<typeof wallet.provider.request>[0])) as `0x${string}`;

      // 3. Server verifies against the nonce it issued.
      setStatus('verifying');
      const verifyRes = await fetch('/api/siwe/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields, signature }),
      });
      const result = await verifyRes.json();

      if (!mounted.current) return;

      if (!verifyRes.ok || !result?.ok) {
        setStatus('signed-out');
        setError(result?.error ?? 'Sign-in failed.');
        return;
      }

      setSessionAddress(address.toLowerCase());
      setStatus('signed-in');
    } catch (err) {
      if (!mounted.current) return;
      setStatus('signed-out');
      const code = (err as { code?: number })?.code;
      // 4001 is a deliberate decline, not a fault worth alarming about.
      setError(
        code === 4001
          ? 'Sign-in rejected in wallet.'
          : err instanceof Error
            ? err.message
            : 'Sign-in failed.'
      );
    }
  }, [wallet, address, chainId]);

  /**
   * Offer sign-in automatically once a wallet is connected.
   *
   * Connecting and proving control are two steps, and asking users to find a
   * second button for the second one leaves most of them unauthenticated with
   * no explanation of why their profile will not save. The prompt is still a
   * normal wallet signature they can decline: nothing here is gated on it, and
   * `autoPrompted` ensures a decline is final until the user asks again.
   */
  useEffect(() => {
    // 'unknown' means the session check is still running — prompting now could
    // demand a signature from someone who is already signed in.
    if (status !== 'signed-out' || !wallet || !address || chainId === null) return;

    const key = address.toLowerCase();
    if (autoPrompted.current.has(key)) return;
    autoPrompted.current.add(key);
    void signIn();
  }, [status, wallet, address, chainId, signIn]);

  // Forget the record when a wallet disconnects, so reconnecting later is
  // treated as a fresh intent to use the app rather than a silent refusal.
  useEffect(() => {
    if (!address) autoPrompted.current.clear();
  }, [address]);

  return {
    status,
    address: sessionAddress,
    error,
    signIn,
    signOut,
    clearError: () => setError(null),
  };
}
