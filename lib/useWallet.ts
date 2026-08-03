'use client';

import { useState, useEffect, useCallback } from 'react';

export function useWallet() {
  const [address, setAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState('');

  const getEth = () => {
    if (typeof window !== 'undefined') {
      return (window as any).ethereum;
    }
    return null;
  };

  const connect = useCallback(async () => {
    const eth = getEth();
    if (!eth) {
      alert('MetaMask not found!');
      return;
    }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        const chain = await eth.request({ method: 'eth_chainId' });
        setChainId(chain);
      }
    } catch (err: any) {
      console.error('Connection failed:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress('');
    setIsConnected(false);
    setChainId('');
  }, []);

  useEffect(() => {
    const eth = getEth();
    if (!eth) return;

    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        eth.request({ method: 'eth_chainId' }).then((chain: string) => setChainId(chain));
      }
    });

    const handleAccounts = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
      } else {
        setAddress('');
        setIsConnected(false);
      }
    };

    const handleChain = (chain: string) => setChainId(chain);

    eth.on('accountsChanged', handleAccounts);
    eth.on('chainChanged', handleChain);

    return () => {
      eth.removeListener('accountsChanged', handleAccounts);
      eth.removeListener('chainChanged', handleChain);
    };
  }, []);

  return { address, isConnected, chainId, connect, disconnect };
}