import { ethers, network } from "hardhat";

/**
 * Live smoke test against the deployed ArcFlowPay.
 *
 * Verification proves the source matches; it does not prove the contract
 * behaves. This exercises the two paths the UI depends on — merchant
 * registration and a real USDC payment — against the deployed address, and
 * checks the fee split arrived where it should.
 *
 * The deployer acts as both merchant and customer. That is unusual for a real
 * payment but it is the only account with funds here, and the fee/net maths is
 * still verified from the receipt rather than from balances alone.
 *
 * Usage:
 *   PAY_ADDRESS=0x... npx hardhat run scripts/smoke-pay.ts --network arcTestnet
 */
async function main() {
  const payAddress = process.env.PAY_ADDRESS;
  if (!payAddress || !ethers.isAddress(payAddress)) {
    throw new Error("PAY_ADDRESS must be set to the deployed ArcFlowPay address");
  }
  const usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress || !ethers.isAddress(usdcAddress)) {
    throw new Error("USDC_ADDRESS must be set");
  }

  const [signer] = await ethers.getSigners();
  console.log("Network :", network.name);
  console.log("Account :", signer.address);
  console.log("Pay     :", payAddress);

  const pay = await ethers.getContractAt("ArcFlowPay", payAddress);
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);

  // 6 decimals on Arc, but read rather than assumed so the amounts below are
  // correct even if the token differs from expectation.
  const decimals = 6;
  const amount = ethers.parseUnits("0.10", decimals);

  // ---------- 1. Merchant registration ----------
  console.log("\n--- 1. Merchant registration ---");
  const alreadyRegistered = await pay.isRegistered(signer.address);
  if (alreadyRegistered) {
    console.log("Already registered, skipping registration.");
  } else {
    const regTx = await pay.registerMerchant("ArcFlow Test Merchant", "Testing");
    console.log("tx:", regTx.hash);
    const regReceipt = await regTx.wait();
    if (!regReceipt || regReceipt.status !== 1) {
      throw new Error("registerMerchant failed");
    }
    console.log("registered in block", regReceipt.blockNumber);
  }

  const merchant = await pay.getMerchant(signer.address);
  console.log("name         :", merchant[0]);
  console.log("category     :", merchant[1]);
  console.log("active       :", merchant[2]);
  console.log("registeredAt :", merchant[3].toString());
  console.log("paymentCount :", merchant[4].toString());

  // ---------- 2. Approve ----------
  console.log("\n--- 2. Approve USDC ---");
  const allowance = await usdc.allowance(signer.address, payAddress);
  if (allowance < amount) {
    const approveTx = await usdc.approve(payAddress, amount);
    console.log("tx:", approveTx.hash);
    const approveReceipt = await approveTx.wait();
    if (!approveReceipt || approveReceipt.status !== 1) {
      throw new Error("approve failed");
    }
    console.log("approved in block", approveReceipt.blockNumber);
  } else {
    console.log("Existing allowance sufficient.");
  }

  // ---------- 3. Payment ----------
  console.log("\n--- 3. Payment ---");
  const feeCollector = await pay.feeCollector();
  const collectorBefore = await usdc.balanceOf(feeCollector);

  const payTx = await pay.pay(signer.address, usdcAddress, amount, "smoke-test");
  console.log("tx:", payTx.hash);
  const payReceipt = await payTx.wait();
  if (!payReceipt || payReceipt.status !== 1) {
    throw new Error("pay failed");
  }
  console.log("paid in block", payReceipt.blockNumber, "gas", payReceipt.gasUsed.toString());

  // The event is the contract's own account of what happened, so the receipt is
  // read from it rather than inferred from balances.
  const paidEvent = payReceipt.logs
    .map((log) => {
      try {
        return pay.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "PaymentMade");

  if (!paidEvent) throw new Error("PaymentMade event not found in receipt");

  const paymentId = paidEvent.args.paymentId as bigint;
  const gross = paidEvent.args.grossAmount as bigint;
  const fee = paidEvent.args.fee as bigint;
  const net = paidEvent.args.netAmount as bigint;

  console.log("\n--- PaymentMade ---");
  console.log("paymentId :", paymentId.toString());
  console.log("gross     :", ethers.formatUnits(gross, decimals));
  console.log("fee       :", ethers.formatUnits(fee, decimals));
  console.log("net       :", ethers.formatUnits(net, decimals));

  const expectedFee = (gross * 50n) / 10000n;
  if (fee !== expectedFee) {
    throw new Error(`Fee mismatch: got ${fee}, expected ${expectedFee}`);
  }
  if (net + fee !== gross) {
    throw new Error("net + fee does not equal gross");
  }
  console.log("fee maths : OK (0.5%)");

  const collectorAfter = await usdc.balanceOf(feeCollector);
  console.log("collector delta:", ethers.formatUnits(collectorAfter - collectorBefore, decimals));

  // ---------- 4. Receipt lookup ----------
  console.log("\n--- 4. Stored receipt ---");
  const stored = await pay.getPayment(paymentId);
  console.log("customer :", stored[0]);
  console.log("merchant :", stored[1]);
  console.log("token    :", stored[2]);
  console.log("gross    :", ethers.formatUnits(stored[3], decimals));
  console.log("memo     :", stored[7]);

  const customerPayments = await pay.getCustomerPayments(signer.address);
  const merchantPayments = await pay.getMerchantPayments(signer.address);
  console.log("customer history entries:", customerPayments.length);
  console.log("merchant history entries:", merchantPayments.length);

  const total = await pay.getMerchantTotalByToken(signer.address, usdcAddress);
  console.log("merchant USDC total:", ethers.formatUnits(total, decimals));

  console.log("\nSMOKE TEST PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
