/**
 * Pre-deployment preflight check for Arc Testnet.
 *
 * Deploying is irreversible and spends real testnet gas, so every precondition
 * is checked first: that the RPC is reachable and is the chain we think it is,
 * that the key parses, and that the deployer can afford the transaction.
 *
 * The private key is never printed — only its length, whether it parses, and
 * the *public* address derived from it. That is enough to confirm the right
 * account is configured without putting the secret on screen or in a log.
 *
 * Usage:  cd contracts && node scripts/preflight.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ethers } = require('ethers');

/** Arc Testnet, per @circle-fin/app-kit's own chain registry. */
const EXPECTED_CHAIN_ID = '5042002';

const line = (label, value) => console.log(label.padEnd(20) + ': ' + value);

function fail(message) {
  console.log('\nSTOP: ' + message);
  process.exitCode = 1;
}

async function main() {
  console.log('--- Configuration (contracts/.env) ---');
  line('ARC_RPC_URL', process.env.ARC_RPC_URL || '(unset)');
  line('ARC_CHAIN_ID', process.env.ARC_CHAIN_ID || '(unset)');
  line('USDC_ADDRESS', process.env.USDC_ADDRESS || '(unset)');
  line('FEE_COLLECTOR', process.env.FEE_COLLECTOR || '(unset -> defaults to deployer)');

  const raw = (process.env.DEPLOYER_PRIVATE_KEY || '').trim();
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  const validHex = hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex);

  console.log('\n--- Deployer key (never printed) ---');
  line('hex length', hex.length + ' (need 64)');
  line('all hex chars', String(/^[0-9a-fA-F]*$/.test(hex)));
  line('format', validHex ? 'VALID' : 'INVALID');

  if (!validHex) {
    return fail(
      'DEPLOYER_PRIVATE_KEY is not a 32-byte hex key.\n' +
        'Set it in contracts/.env as 0x followed by 64 hex characters.'
    );
  }

  let wallet;
  try {
    wallet = new ethers.Wallet('0x' + hex);
  } catch (err) {
    return fail('key did not parse: ' + err.message);
  }
  line('deployer address', wallet.address);

  if (!process.env.ARC_RPC_URL) return fail('ARC_RPC_URL is not set.');

  console.log('\n--- Network ---');
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const actualChainId = (await provider.getNetwork()).chainId.toString();
  line('RPC chainId', actualChainId);
  line('expected', EXPECTED_CHAIN_ID);

  // A chain-id mismatch means the deploy would land on a different network than
  // intended, so it is fatal rather than a warning.
  if (actualChainId !== EXPECTED_CHAIN_ID) return fail('RPC is not Arc Testnet.');
  line('chainId', 'OK');

  if (process.env.ARC_CHAIN_ID && process.env.ARC_CHAIN_ID !== EXPECTED_CHAIN_ID) {
    return fail(`ARC_CHAIN_ID is ${process.env.ARC_CHAIN_ID}, expected ${EXPECTED_CHAIN_ID}.`);
  }

  console.log('\n--- Deployer funding ---');
  const balance = await provider.getBalance(wallet.address);
  const gasPrice = (await provider.getFeeData()).gasPrice ?? 0n;

  // Arc charges gas in USDC rather than a separate gas token, but the native
  // balance is still an 18-decimal value at the RPC level.
  line('native balance', ethers.formatEther(balance));
  line('nonce', String(await provider.getTransactionCount(wallet.address)));
  line('gasPrice', ethers.formatUnits(gasPrice, 'gwei') + ' gwei');

  // 3M gas is a deliberate over-estimate for ArcFlowPay, so passing here leaves
  // headroom rather than only just covering the deploy.
  const estimate = gasPrice * 3000000n;
  line('est. deploy cost', ethers.formatEther(estimate));
  line('funded enough', balance > estimate ? 'YES' : 'NO');

  if (balance <= estimate) {
    return fail(
      'deployer cannot cover the deployment.\n' +
        `Fund ${wallet.address} with Arc Testnet gas and re-run.`
    );
  }

  // Reading the token merchants are actually paid in confirms the address in
  // .env is a real ERC-20 rather than a copied placeholder.
  console.log('\n--- USDC ---');
  try {
    const usdc = new ethers.Contract(
      process.env.USDC_ADDRESS,
      [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
      ],
      provider
    );
    const [decimals, symbol, tokenBalance] = await Promise.all([
      usdc.decimals(),
      usdc.symbol().catch(() => '(no symbol)'),
      usdc.balanceOf(wallet.address),
    ]);
    line('symbol', symbol);
    line('decimals', decimals.toString());
    line('deployer balance', ethers.formatUnits(tokenBalance, decimals));
  } catch (err) {
    console.log('USDC read failed:', err.message);
    return fail('USDC_ADDRESS does not look like a readable ERC-20.');
  }

  console.log('\nPREFLIGHT PASSED - ready to deploy ArcFlowPay to Arc Testnet.');
}

main().catch((err) => {
  console.error('Preflight failed:', err.message);
  process.exitCode = 1;
});
