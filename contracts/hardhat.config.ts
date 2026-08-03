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
    // ARC Testnet - replace with actual RPC when available
    arcTestnet: {
      url: process.env.ARC_RPC_URL || "https://testnet.arc.io/rpc",
      chainId: Number(process.env.ARC_CHAIN_ID || 123456),
      accounts,
      gasPrice: 1000000000, // 1 gwei
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
};

export default config;
