# ArcFlow - Wallet Connection Fix

## How to Apply

Copy these 4 files into your `arcflow/` project folder:

| File | Action |
|------|--------|
| `lib/config.ts` | Create `lib/` folder, put this file inside |
| `components/Web3Provider.tsx` | Put inside `components/` folder |
| `app/layout.tsx` | Replace your existing `layout.tsx` |
| `components/Navbar.tsx` | Replace your existing `Navbar.tsx` |
| `package.json` | Replace your existing `package.json` |

## Steps

1. Copy all 5 files into your `arcflow/` project
2. Run `npm install`
3. Run `npm run dev`
4. Open http://localhost:3000
5. Click "Connect Wallet" - MetaMask popup will appear

## Requirements

- MetaMask browser extension must be installed
- Add ARC Testnet to MetaMask manually if not auto-detected
