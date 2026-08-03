import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ========== Configuration ==========
  // Replace with actual USDC address on ARC Testnet
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x0000000000000000000000000000000000000000";
  const FEE_COLLECTOR = deployer.address; // Fee collector = deployer for now

  const deployed: Record<string, string> = {};

  // ========== 1. Deploy ArcFlowSend ==========
  console.log("\n1. Deploying ArcFlowSend...");
  const ArcFlowSend = await ethers.getContractFactory("ArcFlowSend");
  const send = await ArcFlowSend.deploy(USDC_ADDRESS, FEE_COLLECTOR);
  await send.waitForDeployment();
  deployed["ArcFlowSend"] = await send.getAddress();
  console.log("   ArcFlowSend:", deployed["ArcFlowSend"]);

  // ========== 2. Deploy ArcFlowSwap ==========
  console.log("\n2. Deploying ArcFlowSwap...");
  const ArcFlowSwap = await ethers.getContractFactory("ArcFlowSwap");
  const swap = await ArcFlowSwap.deploy();
  await swap.waitForDeployment();
  deployed["ArcFlowSwap"] = await swap.getAddress();
  console.log("   ArcFlowSwap:", deployed["ArcFlowSwap"]);

  // ========== 3. Deploy ArcFlowPay ==========
  console.log("\n3. Deploying ArcFlowPay...");
  const ArcFlowPay = await ethers.getContractFactory("ArcFlowPay");
  const pay = await ArcFlowPay.deploy(USDC_ADDRESS, FEE_COLLECTOR);
  await pay.waitForDeployment();
  deployed["ArcFlowPay"] = await pay.getAddress();
  console.log("   ArcFlowPay:", deployed["ArcFlowPay"]);

  // ========== 4. Deploy ArcFlowRecurring ==========
  console.log("\n4. Deploying ArcFlowRecurring...");
  const ArcFlowRecurring = await ethers.getContractFactory("ArcFlowRecurring");
  const recurring = await ArcFlowRecurring.deploy(USDC_ADDRESS);
  await recurring.waitForDeployment();
  deployed["ArcFlowRecurring"] = await recurring.getAddress();
  console.log("   ArcFlowRecurring:", deployed["ArcFlowRecurring"]);

  // ========== 5. Deploy ArcFlowSplit ==========
  console.log("\n5. Deploying ArcFlowSplit...");
  const ArcFlowSplit = await ethers.getContractFactory("ArcFlowSplit");
  const split = await ArcFlowSplit.deploy(USDC_ADDRESS);
  await split.waitForDeployment();
  deployed["ArcFlowSplit"] = await split.getAddress();
  console.log("   ArcFlowSplit:", deployed["ArcFlowSplit"]);

  // ========== Summary ==========
  console.log("\n========== Deployment Complete ==========");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);
  console.log("\nContract Addresses:");
  for (const [name, addr] of Object.entries(deployed)) {
    console.log(`  ${name}: ${addr}`);
  }

  // ========== Save to file ==========
  const fs = require("fs");
  const output = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployed,
  };

  fs.writeFileSync(
    "./deployments.json",
    JSON.stringify(output, null, 2)
  );
  console.log("\nSaved to deployments.json");

  // ========== Verify Commands ==========
  console.log("\n========== Verification Commands ==========");
  for (const [name, addr] of Object.entries(deployed)) {
    console.log(`npx hardhat verify --network arcTestnet ${addr}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
