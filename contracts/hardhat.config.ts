import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Load .env if dotenv is installed. Wrapped so `hardhat compile` still works
// in a fresh clone before dependencies are fully installed.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  /* dotenv is optional - env vars can be exported by the shell instead */
}

/**
 * Deployer key is read from the environment only. There is deliberately NO
 * fallback: the previous default ("0x00...01") is a *real*, publicly known
 * private key, so any deploy made without setting DEPLOYER_PRIVATE_KEY would
 * have been signed by an account whose key is known to everyone.
 *
 * Compilation must not require a key, so instead of throwing at module load we
 * simply omit `accounts` when it is missing - Hardhat then fails with a clear
 * "no accounts configured" error at deploy time only.
 */
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = DEPLOYER_KEY ? [DEPLOYER_KEY] : [];

/**
 * Arc Testnet parameters, taken from @circle-fin/app-kit's chain registry (the
 * same source the frontend uses) and confirmed against the live RPC:
 * `eth_chainId` returns 0x4cef52 = 5042002.
 *
 * These are defaults, not overrides - `.env` still wins. The point is that a
 * missing env var can no longer silently target a non-existent network: the
 * previous defaults ("https://testnet.arc.io/rpc" and chainId 123456) were
 * placeholders that do not resolve, so any deploy without a full .env failed
 * with a confusing connection error.
 */
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network/";
const ARC_TESTNET_CHAIN_ID = 5042002;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Arc Testnet. Gas is paid in USDC rather than a separate gas token.
    arcTestnet: {
      url: process.env.ARC_RPC_URL || ARC_TESTNET_RPC,
      chainId: Number(process.env.ARC_CHAIN_ID || ARC_TESTNET_CHAIN_ID),
      accounts,
      // gasPrice is deliberately not pinned. It was hardcoded to 1 gwei while
      // the network actually reports ~20 gwei, which underprices every
      // transaction and leaves deploys pending indefinitely. Letting Hardhat
      // read the live price keeps this correct as network conditions change.
    },
    // Ethereum Sepolia for testing
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  /**
   * Source verification on ArcScan.
   *
   * ArcScan is a Blockscout instance, which exposes an Etherscan-compatible
   * `/api` surface, so the standard hardhat-verify plugin works once the chain
   * is registered here (it does not know chain 5042002 natively). Blockscout
   * ignores the API key but hardhat-verify requires a non-empty string.
   */
  etherscan: {
    apiKey: {
      arcTestnet: process.env.ARCSCAN_API_KEY || "blockscout",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: ARC_TESTNET_CHAIN_ID,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
};

export default config;
