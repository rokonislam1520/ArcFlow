# ArcFlow Smart Contracts

Solidity smart contracts for ArcFlow Stablecoin SuperApp.

## Contracts

| Contract | Description |
|----------|-------------|
| `ArcFlowSend.sol` | Gasless USDC transfers via EIP-712 meta-transactions |
| `ArcFlowSwap.sol` | Stablecoin AMM (constant product, 0.3% fee) |
| `ArcFlowPay.sol` | Merchant payment system (0.5% fee) |
| `ArcFlowRecurring.sol` | Automated recurring payments (subscriptions, rent) |
| `ArcFlowSplit.sol` | Bill splitting among friends |

## Setup

```bash
cd contracts
npm install
```

## Compile

```bash
npx hardhat compile
```

## Deploy to ARC Testnet

```bash
# 1. Copy .env.example to .env and fill in your private key
cp .env.example .env

# 2. Deploy
npx hardhat run scripts/deploy.ts --network arcTestnet
```

## Deploy to Localhost (testing)

```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy
npx hardhat run scripts/deploy.ts --network localhost
```

## After Deployment

1. Copy contract addresses from `deployments.json`
2. Add to your `.env.local`:
```
NEXT_PUBLIC_ARCFLOW_SEND=0x...
NEXT_PUBLIC_ARCFLOW_SWAP=0x...
NEXT_PUBLIC_ARCFLOW_PAY=0x...
NEXT_PUBLIC_ARCFLOW_RECURRING=0x...
NEXT_PUBLIC_ARCFLOW_SPLIT=0x...
```
3. Restart your Next.js app

## Contract Details

### ArcFlowSend
- **Gasless**: Relayer submits tx, user signs off-chain (EIP-712)
- **Fee**: 0.1% of transfer amount
- **Min Transfer**: $1 USDC

### ArcFlowSwap
- **AMM**: Constant product formula optimized for stablecoins
- **Fee**: 0.3% per swap
- **Whitelisted Tokens**: Only stablecoins (USDC, USDT, DAI, EURC)

### ArcFlowPay
- **Registration**: Merchants self-register with name + category
- **Fee**: 0.5% paid by merchant
- **Instant Settlement**: No waiting period

### ArcFlowRecurring
- **Frequencies**: Weekly, Monthly, Quarterly, Yearly
- **Keeper Pattern**: Anyone can execute due payments
- **Auto-deactivate**: Stops when max executions reached

### ArcFlowSplit
- **Group Split**: Create split groups with custom shares
- **Settlement**: Each member settles independently
- **Status Tracking**: Active → Partial → Settled
