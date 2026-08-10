import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy ArcFlowPay only.
 *
 * `deploy.ts` deploys all five contracts. Only Pay is wired into the frontend,
 * and each deployment is permanent and costs gas, so the others are left out
 * rather than creating live addresses nothing calls.
 *
 * ArcFlowPay takes the fee collector as its single constructor argument. The
 * payment token is chosen per call, so no token address is baked in here.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  const net = await provider.getNetwork();
  console.log("Network :", network.name);
  console.log("Chain ID:", net.chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await provider.getBalance(deployer.address);
  console.log("Balance :", ethers.formatEther(balance));

  // Fees are unrecoverable if sent to a wrong or zero address, so the collector
  // is validated before anything is broadcast.
  const FEE_COLLECTOR = process.env.FEE_COLLECTOR || deployer.address;
  if (!ethers.isAddress(FEE_COLLECTOR) || FEE_COLLECTOR === ZERO) {
    throw new Error("FEE_COLLECTOR must be a valid non-zero address");
  }
  console.log("Fee collector:", FEE_COLLECTOR);

  console.log("\nDeploying ArcFlowPay...");
  const ArcFlowPay = await ethers.getContractFactory("ArcFlowPay");
  const pay = await ArcFlowPay.deploy(FEE_COLLECTOR);

  const deployTx = pay.deploymentTransaction();
  console.log("Tx hash :", deployTx?.hash);

  await pay.waitForDeployment();
  const address = await pay.getAddress();

  // waitForDeployment resolves once mined; the receipt is fetched explicitly so
  // the deployment is confirmed by status rather than assumed to have worked.
  const receipt = deployTx ? await provider.getTransactionReceipt(deployTx.hash) : null;
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deployment transaction did not succeed (status ${receipt?.status})`);
  }

  console.log("\n========== Deployed ==========");
  console.log("ArcFlowPay :", address);
  console.log("Block      :", receipt.blockNumber);
  console.log("Gas used   :", receipt.gasUsed.toString());
  console.log("Status     :", receipt.status === 1 ? "SUCCESS" : "FAILED");

  // Reading back through the deployed contract proves the address holds working
  // code, not just that a transaction was mined.
  const feeBps = await pay.feeBps();
  const feeCollector = await pay.feeCollector();
  const owner = await pay.owner();
  console.log("\n--- On-chain state ---");
  console.log("feeBps       :", feeBps.toString(), `(${Number(feeBps) / 100}%)`);
  console.log("feeCollector :", feeCollector);
  console.log("owner        :", owner);

  if (feeCollector.toLowerCase() !== FEE_COLLECTOR.toLowerCase()) {
    throw new Error("Deployed feeCollector does not match the configured address");
  }

  // Merged into the existing file so a single-contract deploy does not discard
  // the record of contracts deployed previously.
  const outPath = path.join(__dirname, "..", "deployments.json");
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch {
      /* a corrupt file should not abort a successful deployment */
    }
  }

  const previous = (existing.contracts as Record<string, string>) ?? {};
  const output = {
    ...existing,
    network: network.name,
    chainId: net.chainId.toString(),
    deployer: deployer.address,
    feeCollector: FEE_COLLECTOR,
    timestamp: new Date().toISOString(),
    contracts: { ...previous, ArcFlowPay: address },
    deploymentTx: deployTx?.hash,
    blockNumber: receipt.blockNumber,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("\nSaved to", outPath);

  // Verification needs the block explorer to have indexed the contract, which
  // is not instant; skipped on local networks where there is no explorer.
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting for explorer indexing before verifying...");
    await new Promise((resolve) => setTimeout(resolve, 30000));
    try {
      await run("verify:verify", { address, constructorArguments: [FEE_COLLECTOR] });
      console.log("Verified on explorer.");
    } catch (err) {
      // A failed verification does not invalidate a good deployment, so this
      // reports and continues rather than throwing.
      console.log("Verification failed:", (err as Error).message);
      console.log(
        `Retry manually: npx hardhat verify --network ${network.name} ${address} ${FEE_COLLECTOR}`
      );
    }
  }

  console.log("\n========== Frontend .env.local ==========");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${net.chainId}`);
  console.log(`NEXT_PUBLIC_PAY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
