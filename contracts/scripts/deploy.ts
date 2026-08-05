import { ethers } from "hardhat";

const ZERO = "0x0000000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ========== Configuration ==========
  // Every USDC-based contract now reverts on a zero address, so validate up
  // front instead of deploying five permanently broken contracts.
  const USDC_ADDRESS = process.env.USDC_ADDRESS;
  if (!USDC_ADDRESS || USDC_ADDRESS === ZERO || !ethers.isAddress(USDC_ADDRESS)) {
    throw new Error(
      "USDC_ADDRESS must be set to a valid non-zero token address (see contracts/.env.example)"
    );
  }

  const FEE_COLLECTOR = process.env.FEE_COLLECTOR || deployer.address;
  if (!ethers.isAddress(FEE_COLLECTOR) || FEE_COLLECTOR === ZERO) {
    throw new Error("FEE_COLLECTOR must be a valid non-zero address");
  }

  console.log("USDC:", USDC_ADDRESS);
  console.log("Fee collector:", FEE_COLLECTOR);

  const deployed: Record<string, string> = {};
  // Constructor args are tracked so the printed verify commands actually work.
  const constructorArgs: Record<string, string[]> = {};

  // ========== 1. Deploy ArcFlowSend ==========
  console.log("\n1. Deploying ArcFlowSend...");
  const ArcFlowSend = await ethers.getContractFactory("ArcFlowSend");
  const send = await ArcFlowSend.deploy(USDC_ADDRESS, FEE_COLLECTOR);
  await send.waitForDeployment();
  deployed["ArcFlowSend"] = await send.getAddress();
  constructorArgs["ArcFlowSend"] = [USDC_ADDRESS, FEE_COLLECTOR];
  console.log("   ArcFlowSend:", deployed["ArcFlowSend"]);

  // ========== 2. Deploy ArcFlowSwap ==========
  console.log("\n2. Deploying ArcFlowSwap...");
  const ArcFlowSwap = await ethers.getContractFactory("ArcFlowSwap");
  const swap = await ArcFlowSwap.deploy();
  await swap.waitForDeployment();
  deployed["ArcFlowSwap"] = await swap.getAddress();
  constructorArgs["ArcFlowSwap"] = [];
  console.log("   ArcFlowSwap:", deployed["ArcFlowSwap"]);

  // ========== 3. Deploy ArcFlowPay ==========
  console.log("\n3. Deploying ArcFlowPay...");
  const ArcFlowPay = await ethers.getContractFactory("ArcFlowPay");
  // ArcFlowPay's constructor takes only the fee collector. It previously also
  // took a USDC address, and this call still passed one — as the *first*
  // argument, which meant the token address was being deployed as the fee
  // collector. Every fee would have been sent to the USDC contract itself and
  // been unrecoverable.
  const pay = await ArcFlowPay.deploy(FEE_COLLECTOR);
  await pay.waitForDeployment();
  deployed["ArcFlowPay"] = await pay.getAddress();
  constructorArgs["ArcFlowPay"] = [FEE_COLLECTOR];
  console.log("   ArcFlowPay:", deployed["ArcFlowPay"]);

  // ========== 4. Deploy ArcFlowRecurring ==========
  console.log("\n4. Deploying ArcFlowRecurring...");
  const ArcFlowRecurring = await ethers.getContractFactory("ArcFlowRecurring");
  // Takes no constructor arguments: the token is supplied per subscription
  // rather than fixed at deployment.
  const recurring = await ArcFlowRecurring.deploy();
  await recurring.waitForDeployment();
  deployed["ArcFlowRecurring"] = await recurring.getAddress();
  constructorArgs["ArcFlowRecurring"] = [];
  console.log("   ArcFlowRecurring:", deployed["ArcFlowRecurring"]);

  // ========== 5. Deploy ArcFlowSplit ==========
  console.log("\n5. Deploying ArcFlowSplit...");
  const ArcFlowSplit = await ethers.getContractFactory("ArcFlowSplit");
  // Takes no constructor arguments: the token is supplied per split.
  const split = await ArcFlowSplit.deploy();
  await split.waitForDeployment();
  deployed["ArcFlowSplit"] = await split.getAddress();
  constructorArgs["ArcFlowSplit"] = [];
  console.log("   ArcFlowSplit:", deployed["ArcFlowSplit"]);

  // ========== Summary ==========
  const network = await ethers.provider.getNetwork();
  console.log("\n========== Deployment Complete ==========");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("\nContract Addresses:");
  for (const [name, addr] of Object.entries(deployed)) {
    console.log(`  ${name}: ${addr}`);
  }

  // ========== Save to file ==========
  const fs = require("fs");
  const path = require("path");
  const output = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    usdc: USDC_ADDRESS,
    feeCollector: FEE_COLLECTOR,
    timestamp: new Date().toISOString(),
    contracts: deployed,
  };

  // Resolve relative to this script so the output lands in contracts/ no
  // matter which directory hardhat was invoked from.
  const outPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("\nSaved to", outPath);

  // ========== Verify Commands ==========
  console.log("\n========== Verification Commands ==========");
  for (const [name, addr] of Object.entries(deployed)) {
    const args = constructorArgs[name].join(" ");
    console.log(`npx hardhat verify --network ${network.name} ${addr}${args ? " " + args : ""}`);
  }

  // ========== Frontend env ==========
  console.log("\n========== Frontend .env.local ==========");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${network.chainId}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${USDC_ADDRESS}`);
  for (const [name, addr] of Object.entries(deployed)) {
    const key = name.replace("ArcFlow", "").toUpperCase();
    console.log(`NEXT_PUBLIC_${key}_ADDRESS=${addr}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
