# ArcFlow Smart Contract Audit — P5 Complete

**Audited:** 2026-08-05  
**Status:** ✅ All issues fixed, 15/15 tests passing

---

## Executive Summary

Comprehensive security audit of ArcFlowSplit, ArcFlowPay, and ArcFlowRecurring identified **5 critical vulnerability classes** affecting all three contracts. All issues have been fixed through complete contract rewrites with production-grade security hardening.

---

## Vulnerabilities Found & Fixed

### 1. **CRITICAL: USDT Incompatibility**
**Location:** All contracts  
**Issue:** `require(token.transferFrom(...))` breaks on USDT-style tokens that return no value  
**Impact:** Contracts permanently unusable with USDT, one of the most widely used stablecoins  
**Fix:** Implemented `SafeERC20` library with low-level calls + optional-return handling

### 2. **HIGH: Reentrancy Risk**
**Location:** All contracts  
**Issue:** No reentrancy guards; ERC-777 tokens with transfer hooks can re-enter mid-flight  
**Impact:** Potential double-spend, state corruption, fund theft  
**Fix:** Added `ReentrancyGuard` with `nonReentrant` modifier on all state-changing operations

### 3. **MEDIUM: Ownership Bricking**
**Location:** All contracts  
**Issue:** Single-step `transferOwnership` — one typo permanently locks admin functions  
**Impact:** Loss of fee control, emergency stop, configuration  
**Fix:** Implemented `Ownable2Step` requiring acceptance from new owner

### 4. **MEDIUM: Missing Join Flow (Split)**
**Location:** ArcFlowSplit  
**Issue:** Members were hardcoded at creation; no way to join later  
**Impact:** "Share a link" use case impossible; only pre-known groups work  
**Fix:** Added `joinSplit(groupId, share)` + `lockGroup()` + open/closed group modes

### 5. **CRITICAL: No Keeper Incentive (Recurring)**
**Location:** ArcFlowRecurring  
**Issue:** Permissionless execution with zero reward — no one would ever call it  
**Impact:** Feature is dead on arrival; no automation actually happens  
**Fix:** 1% keeper bounty (configurable 0-5%) paid to `msg.sender` from gross amount

---

## Production Improvements

### Security Library (`contracts/lib/Security.sol`)
- **SafeERC20:** Handles no-return + fee-on-transfer tokens via balance-diff accounting
- **ReentrancyGuard:** Prevents nested calls; protects cross-function reentrancy
- **Ownable2Step:** Requires new owner acceptance before control transfers
- **Pausable:** Emergency stop that never traps user funds (refunds stay open)

### ArcFlowSplit (Escrow Model)
- **Atomic settlement:** Recipient receives full bill once, not N dribbles
- **Join flow:** `createSplit` → members `joinSplit` → creator `lockGroup` → all pay → settle
- **Cancel + refund:** Members pull their escrow if group fails (no push loop)
- **Per-group token:** Mixing tokens would make `collected` meaningless

**New Functions:**
- `joinSplit(groupId, share)` — self-serve membership
- `lockGroup(groupId)` — finalize roster
- `cancelSplit(groupId)` — abort before settlement
- `withdrawRefund(groupId)` — pull escrow after cancel
- `settle(groupId)` — release to recipient when fully paid

### ArcFlowPay (Receipt System)
- **Payment IDs:** Every payment gets unique ID + full receipt (customer/merchant/token/amounts/memo)
- **Multi-token:** Merchant tracks `totalReceivedByToken[token]` separately
- **Verifiable history:** `getMerchantPayments(merchant)` + `getCustomerPayments(customer)`
- **0.5% merchant fee** (configurable 0-5%)

**New Functions:**
- `pay(merchant, token, amount, memo)` returns `paymentId`
- `getPayment(paymentId)` → full receipt struct
- `getMerchantTotalByToken(merchant, token)` → per-token ledger
- `getMerchantPayments(merchant)` / `getCustomerPayments(customer)` → ID arrays

### ArcFlowRecurring (Keeper Economics)
- **Permissionless execution:** Anyone can call `executePayment` and earn the bounty
- **1% default reward:** Viable on L2s ($100 subscription = $1 reward vs $0.10 gas on Arbitrum)
- **Schedule anchoring:** Late execution doesn't reduce annual payment count
- **Configurable per-payment:** High-value subscriptions can offer higher % to compete for faster execution

**Economic Model:**
```
Gross = baseAmount + (baseAmount × keeperRewardBps / 10000)
Payee receives: baseAmount
Executor receives: reward
Payer approves: gross × max_executions
```

**New Functions:**
- `createRecurring(..., keeperRewardBps, ...)` — now requires reward parameter
- `executePayment(paymentId)` — anyone calls, earns reward
- `getGrossAmount(paymentId)` — total payer must approve
- `isDue(paymentId)` — keeper bot query

---

## Test Coverage

**15 tests, all passing** against local Hardhat EVM:

### ArcFlowSplit
- ✅ Closed split → pay → settle
- ✅ Open split → join → lock → pay → settle
- ✅ Cancel → refund
- ✅ USDT-style token (no return value) works
- ✅ Fee-on-transfer token: credits actual received

### ArcFlowPay
- ✅ Merchant register → customer pay → receipt exists
- ✅ Multi-token tracking
- ✅ Payment history (customer + merchant views)

### ArcFlowRecurring
- ✅ Create → execute → keeper earns reward
- ✅ Max executions → auto-deactivate
- ✅ Cancel prevents future execution
- ✅ Schedule anchors to start time

### Security
- ✅ Pause blocks new operations (refunds stay open)
- ✅ 2-step ownership transfer
- ✅ Reentrancy protection

**Test tokens:**
- `MockERC20`: standard compliant
- `MockNoReturnERC20`: USDT-style (no bool)
- `MockFeeOnTransferERC20`: 10% burn on transfer

---

## Breaking Changes

All three contracts have **completely different ABIs** from the original version. Frontend integration requires:

1. Update `lib/config.ts` ABIs
2. Deploy script: `ArcFlowPay(feeCollector)` + `ArcFlowRecurring()` constructors changed
3. Split pages: replace `paymentMethod` with `joinSplit` + `lockGroup` + `payShare` flow
4. Merchant pages: replace `pay(merchant, amount)` with `pay(merchant, token, amount, memo)`
5. Recurring pages: add `keeperRewardBps` parameter + display gross amount

**Deploy command:**
```bash
cd contracts
cp .env.example .env
# Edit .env: set USDC_ADDRESS + FEE_COLLECTOR + DEPLOYER_PRIVATE_KEY
npm run deploy:localhost  # or deploy:arc
```

---

## Security Considerations

### Fee-on-Transfer Tokens
Escrow (Split) moves tokens twice, so FoT tokens burn twice:
- Payer → contract: 10% burned
- Contract → recipient: another 10% burned
- Net: 81% reaches recipient from 100 requested

**Recommendation:** UI should warn before using FoT tokens in Split.

### Keeper Economics (Recurring)
- Mainnet ($3 gas): 1% bounty not viable until $300+ subscriptions
- L2s ($0.10 gas): profitable at $10+ subscriptions
- Target deployment: Arbitrum/Optimism/Base

### Gas Optimization
- Struct packing: `uint32` + `uint64` + `bool` fit in single slots
- View functions return arrays (unbounded in theory; pagination at UI layer)
- `MAX_MEMBERS = 50` prevents create/view gas bombs

---

## Files Changed

**New:**
- `contracts/contracts/lib/Security.sol` — shared primitives
- `contracts/contracts/test/MockTokens.sol` — test tokens
- `contracts/test/ArcFlow.test.ts` — 15-test suite

**Rewritten:**
- `contracts/contracts/ArcFlowSplit.sol`
- `contracts/contracts/ArcFlowPay.sol`
- `contracts/contracts/ArcFlowRecurring.sol`

**Deploy:**
- `contracts/scripts/deploy.ts` — updated constructor args

---

## Recommendations

1. **Gitignore artifacts:** Add `contracts/artifacts/` + `contracts/cache/` to `.gitignore`
2. **Frontend migration:** Update ABIs in `lib/config.ts` + rewrite pages to new flows
3. **Keeper bot:** Build automated executor for Recurring (Gelato/Chainlink/custom)
4. **Multi-sig:** Use 2-of-3 multi-sig for protocol owner (not EOA)
5. **Formal audit:** External audit recommended before mainnet (Certora/Trail of Bits)

---

## Commit

```
git: 162894a
feat(P5): production contracts + security hardening + keeper economics
```

**Status:** ✅ Contracts production-ready; frontend integration required.
