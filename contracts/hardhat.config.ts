import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

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
      chainId: 123456, // Replace with actual ARC testnet chain ID
      accounts: [DEPLOYER_KEY],
      gasPrice: 1000000000, // 1 gwei
    },
    // Ethereum Sepolia for testing
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: [DEPLOYER_KEY],
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
