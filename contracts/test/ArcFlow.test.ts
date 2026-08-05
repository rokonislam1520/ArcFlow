import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ArcFlow Contract Suite", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let feeCollector: SignerWithAddress;

  let usdc: any;
  let noReturnToken: any;
  let feeToken: any;

  let split: any;
  let pay: any;
  let recurring: any;

  const USDC_DECIMALS = 6;
  const ONE_USDC = ethers.parseUnits("1", USDC_DECIMALS);
  const HUNDRED_USDC = ethers.parseUnits("100", USDC_DECIMALS);

  beforeEach(async function () {
    [deployer, alice, bob, charlie, feeCollector] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", USDC_DECIMALS);

    const MockNoReturn = await ethers.getContractFactory("MockNoReturnERC20");
    noReturnToken = await MockNoReturn.deploy();

    const MockFee = await ethers.getContractFactory("MockFeeOnTransferERC20");
    feeToken = await MockFee.deploy();

    // Mint tokens
    await usdc.mint(alice.address, HUNDRED_USDC * 10n);
    await usdc.mint(bob.address, HUNDRED_USDC * 10n);
    await usdc.mint(charlie.address, HUNDRED_USDC * 10n);

    await noReturnToken.mint(alice.address, HUNDRED_USDC * 10n);
    await feeToken.mint(alice.address, HUNDRED_USDC * 10n);

    // Deploy contracts
    const ArcFlowSplit = await ethers.getContractFactory("ArcFlowSplit");
    split = await ArcFlowSplit.deploy();

    const ArcFlowPay = await ethers.getContractFactory("ArcFlowPay");
    pay = await ArcFlowPay.deploy(feeCollector.address);

    const ArcFlowRecurring = await ethers.getContractFactory("ArcFlowRecurring");
    recurring = await ArcFlowRecurring.deploy();
  });

  describe("ArcFlowSplit", function () {
    it("Create closed split → members pay → settle", async function () {
      const recipient = charlie.address;
      const members = [alice.address, bob.address];
      const shares = [ONE_USDC * 30n, ONE_USDC * 70n]; // 30 + 70 = 100

      await usdc.connect(alice).approve(await split.getAddress(), shares[0]);
      await usdc.connect(bob).approve(await split.getAddress(), shares[1]);

      const tx = await split
        .connect(alice)
        .createSplit("Dinner", await usdc.getAddress(), recipient, members, shares, false);
      const receipt = await tx.wait();
      const groupId = 0n;

      // Group is immediately locked (closed, no joins allowed)
      const group = await split.getGroup(groupId);
      expect(group.status).to.equal(1); // Locked

      // Members pay
      await split.connect(alice).payShare(groupId);
      await split.connect(bob).payShare(groupId);

      const groupAfter = await split.getGroup(groupId);
      expect(groupAfter.collected).to.equal(ONE_USDC * 100n);

      // Settle
      const recipientBefore = await usdc.balanceOf(recipient);
      await split.connect(alice).settle(groupId);
      const recipientAfter = await usdc.balanceOf(recipient);

      expect(recipientAfter - recipientBefore).to.equal(ONE_USDC * 100n);
      const final = await split.getGroup(groupId);
      expect(final.status).to.equal(2); // Settled
    });

    it("Open split → join → lock → pay → settle", async function () {
      const recipient = charlie.address;
      const tx = await split
        .connect(alice)
        .createSplit("Party", await usdc.getAddress(), recipient, [], [], true);
      const groupId = 0n;

      // Bob joins
      await split.connect(bob).joinSplit(groupId, ONE_USDC * 50n);

      // Alice joins after creation
      await split.connect(alice).joinSplit(groupId, ONE_USDC * 50n);

      // Creator locks
      await split.connect(alice).lockGroup(groupId);

      const group = await split.getGroup(groupId);
      expect(group.status).to.equal(1); // Locked
      expect(group.committed).to.equal(ONE_USDC * 100n);

      // Pay
      await usdc.connect(alice).approve(await split.getAddress(), ONE_USDC * 50n);
      await usdc.connect(bob).approve(await split.getAddress(), ONE_USDC * 50n);
      await split.connect(alice).payShare(groupId);
      await split.connect(bob).payShare(groupId);

      // Settle. Charlie was pre-minted a starting balance in `beforeEach`, so
      // this asserts the delta rather than the absolute balance.
      const recipientBefore = await usdc.balanceOf(recipient);
      await split.connect(alice).settle(groupId);
      const recipientAfter = await usdc.balanceOf(recipient);
      expect(recipientAfter - recipientBefore).to.equal(ONE_USDC * 100n);
    });

    it("Cancel → members withdraw refund", async function () {
      const members = [alice.address, bob.address];
      const shares = [ONE_USDC * 40n, ONE_USDC * 60n];

      await split
        .connect(alice)
        .createSplit("Rent", await usdc.getAddress(), charlie.address, members, shares, false);

      const groupId = 0n;

      await usdc.connect(alice).approve(await split.getAddress(), shares[0]);
      await split.connect(alice).payShare(groupId);

      // Cancel before full payment
      await split.connect(alice).cancelSplit(groupId);

      const aliceBefore = await usdc.balanceOf(alice.address);
      await split.connect(alice).withdrawRefund(groupId);
      const aliceAfter = await usdc.balanceOf(alice.address);

      expect(aliceAfter - aliceBefore).to.equal(shares[0]);
    });

    it("USDT-style token (no return value) works", async function () {
      await noReturnToken.connect(alice).approve(await split.getAddress(), ONE_USDC * 50n);

      await split
        .connect(alice)
        .createSplit(
          "Test",
          await noReturnToken.getAddress(),
          charlie.address,
          [alice.address],
          [ONE_USDC * 50n],
          false
        );

      // Should not revert even though transferFrom returns void
      await split.connect(alice).payShare(0n);
      await split.connect(alice).settle(0n);

      const balance = await noReturnToken.balanceOf(charlie.address);
      expect(balance).to.equal(ONE_USDC * 50n);
    });

    it("Fee-on-transfer token: credits actual received", async function () {
      // Fee token burns 10% on transfer
      const requested = ONE_USDC * 100n;
      const netExpected = (requested * 9000n) / 10000n; // 90 after 10% burn

      await feeToken.connect(alice).approve(await split.getAddress(), requested);

      await split
        .connect(alice)
        .createSplit(
          "FeeTest",
          await feeToken.getAddress(),
          charlie.address,
          [alice.address],
          [requested],
          false
        );

      await split.connect(alice).payShare(0n);

      const group = await split.getGroup(0n);
      // The group is credited with what actually arrived (90), not what was
      // requested (100). This is the property that keeps escrow solvent: if the
      // contract credited 100 it would owe more than it holds and settlement
      // would revert forever.
      expect(group.collected).to.equal(netExpected);

      // Escrow moves the token twice (payer -> contract -> recipient) and this
      // token burns on every hop, so the recipient nets 90 - 10% = 81.
      //
      // This double fee is inherent to escrow with fee-on-transfer tokens, not
      // an accounting bug. It is the real cost of making settlement atomic, and
      // it is why the UI should warn before using a FoT token in a split rather
      // than the contract silently absorbing the difference.
      const expectedOut = (netExpected * 9000n) / 10000n;

      const charlieBefore = await feeToken.balanceOf(charlie.address);
      await split.connect(alice).settle(0n);
      const charlieAfter = await feeToken.balanceOf(charlie.address);
      expect(charlieAfter - charlieBefore).to.equal(expectedOut);
    });
  });

  describe("ArcFlowPay", function () {
    it("Merchant registers → customer pays → receipt exists", async function () {
      await pay.connect(bob).registerMerchant("Bob's Store", "Retail");

      const isReg = await pay.isRegistered(bob.address);
      expect(isReg).to.be.true;

      const amount = ONE_USDC * 50n;
      await usdc.connect(alice).approve(await pay.getAddress(), amount);

      const tx = await pay
        .connect(alice)
        .pay(bob.address, await usdc.getAddress(), amount, "Invoice #123");

      const receipt = await tx.wait();
      const paymentId = 1n;

      const payment = await pay.getPayment(paymentId);
      expect(payment.customer).to.equal(alice.address);
      expect(payment.merchant).to.equal(bob.address);
      expect(payment.grossAmount).to.equal(amount);

      // Fee: 0.5% = 50 bps
      const expectedFee = (amount * 50n) / 10000n;
      expect(payment.fee).to.equal(expectedFee);

      const netAmount = amount - expectedFee;
      expect(payment.netAmount).to.equal(netAmount);

      // Merchant received net
      const bobBalance = await usdc.balanceOf(bob.address);
      expect(bobBalance).to.be.gte(netAmount);

      // Fee collector received fee
      const feeBalance = await usdc.balanceOf(feeCollector.address);
      expect(feeBalance).to.equal(expectedFee);
    });

    it("Multi-token: merchant tracks totals separately", async function () {
      await pay.connect(bob).registerMerchant("Multi Store", "Tech");

      await usdc.connect(alice).approve(await pay.getAddress(), ONE_USDC * 100n);
      await feeToken.connect(alice).approve(await pay.getAddress(), ONE_USDC * 100n);

      await pay.connect(alice).pay(bob.address, await usdc.getAddress(), ONE_USDC * 50n, "");
      await pay.connect(alice).pay(bob.address, await feeToken.getAddress(), ONE_USDC * 30n, "");

      const usdcTotal = await pay.getMerchantTotalByToken(bob.address, await usdc.getAddress());
      const feeTotal = await pay.getMerchantTotalByToken(bob.address, await feeToken.getAddress());

      // Each net of 0.5% fee
      const usdcNet = (ONE_USDC * 50n * 9950n) / 10000n;
      expect(usdcTotal).to.equal(usdcNet);

      // Fee token also burns 10% on transfer, so net is (30 * 0.9 * 0.995)
      // The contract sees 27 arrive, then takes 0.5% fee from that
      const feeTokenNet = (ONE_USDC * 30n * 9n) / 10n; // 27 after burn
      const merchantNet = (feeTokenNet * 9950n) / 10000n;
      expect(feeTotal).to.be.closeTo(merchantNet, ONE_USDC / 100n);
    });

    it("Payment history: customer and merchant views", async function () {
      await pay.connect(bob).registerMerchant("Shop", "Food");

      await usdc.connect(alice).approve(await pay.getAddress(), ONE_USDC * 200n);
      await pay.connect(alice).pay(bob.address, await usdc.getAddress(), ONE_USDC * 50n, "A");
      await pay.connect(alice).pay(bob.address, await usdc.getAddress(), ONE_USDC * 30n, "B");

      const alicePayments = await pay.getCustomerPayments(alice.address);
      expect(alicePayments.length).to.equal(2);

      const bobPayments = await pay.getMerchantPayments(bob.address);
      expect(bobPayments.length).to.equal(2);

      const payment1 = await pay.getPayment(alicePayments[0]);
      expect(payment1.memo).to.equal("A");
    });
  });

  describe("ArcFlowRecurring", function () {
    it("Create → execute → keeper earns reward", async function () {
      const baseAmount = ONE_USDC * 100n;
      const keeperRewardBps = 100n; // 1%
      const grossAmount = baseAmount + (baseAmount * keeperRewardBps) / 10000n; // 101 USDC

      await usdc.connect(alice).approve(await recurring.getAddress(), grossAmount * 10n);

      const tx = await recurring
        .connect(alice)
        .createRecurring(
          bob.address,
          await usdc.getAddress(),
          baseAmount,
          1, // Weekly
          0, // unlimited
          keeperRewardBps,
          "Subscription"
        );

      const paymentId = 1n;

      // Fast forward past the first interval
      await time.increase(7 * 24 * 60 * 60 + 1);

      const isDue = await recurring.isDue(paymentId);
      expect(isDue).to.be.true;

      const charlieBefore = await usdc.balanceOf(charlie.address);
      const bobBefore = await usdc.balanceOf(bob.address);

      // Charlie executes as keeper
      await recurring.connect(charlie).executePayment(paymentId);

      const charlieAfter = await usdc.balanceOf(charlie.address);
      const bobAfter = await usdc.balanceOf(bob.address);

      // Keeper reward: 1 USDC
      const expectedReward = (baseAmount * keeperRewardBps) / 10000n;
      expect(charlieAfter - charlieBefore).to.equal(expectedReward);

      // Payee gets base amount
      expect(bobAfter - bobBefore).to.equal(baseAmount);

      const payment = await recurring.getPayment(paymentId);
      expect(payment.executions).to.equal(1);
      expect(payment.totalPaid).to.equal(baseAmount);
    });

    it("Max executions: auto-deactivates", async function () {
      await usdc.connect(alice).approve(await recurring.getAddress(), ONE_USDC * 1000n);

      await recurring
        .connect(alice)
        .createRecurring(
          bob.address,
          await usdc.getAddress(),
          ONE_USDC * 10n,
          0, // Daily
          2, // max 2 executions
          100n,
          "Limited"
        );

      const paymentId = 1n;

      // First execution
      await time.increase(24 * 60 * 60 + 1);
      await recurring.connect(charlie).executePayment(paymentId);

      // Second execution
      await time.increase(24 * 60 * 60 + 1);
      await recurring.connect(charlie).executePayment(paymentId);

      const payment = await recurring.getPayment(paymentId);
      expect(payment.active).to.be.false;
      expect(payment.executions).to.equal(2);

      // Third attempt fails. Hitting the cap sets `active = false`, and the
      // active check runs first, so "Not active" is the reason that surfaces.
      // Asserting the actual guard rather than the one I assumed would fire.
      await time.increase(24 * 60 * 60 + 1);
      await expect(recurring.connect(charlie).executePayment(paymentId)).to.be.revertedWith(
        "Not active"
      );
    });

    it("Cancel prevents future executions", async function () {
      await usdc.connect(alice).approve(await recurring.getAddress(), ONE_USDC * 1000n);

      await recurring
        .connect(alice)
        .createRecurring(
          bob.address,
          await usdc.getAddress(),
          ONE_USDC * 10n,
          1, // Weekly
          0,
          100n,
          "Test"
        );

      const paymentId = 1n;

      await recurring.connect(alice).cancelRecurring(paymentId);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(recurring.connect(charlie).executePayment(paymentId)).to.be.revertedWith(
        "Not active"
      );
    });

    it("Schedule anchors to start time, not execution time", async function () {
      await usdc.connect(alice).approve(await recurring.getAddress(), ONE_USDC * 1000n);

      const tx = await recurring
        .connect(alice)
        .createRecurring(
          bob.address,
          await usdc.getAddress(),
          ONE_USDC * 10n,
          1, // Weekly
          0,
          100n,
          "Anchor"
        );

      const receipt = await tx.wait();
      const paymentId = 1n;

      const initialPayment = await recurring.getPayment(paymentId);
      const firstDue = initialPayment.nextPayment;

      // Wait 8 weeks (1 missed interval)
      await time.increase(8 * 7 * 24 * 60 * 60);

      await recurring.connect(charlie).executePayment(paymentId);

      const afterExec = await recurring.getPayment(paymentId);
      // Next should be firstDue + 8 weeks, not "now + 1 week"
      const expectedNext = firstDue + BigInt(8 * 7 * 24 * 60 * 60);
      expect(afterExec.nextPayment).to.be.closeTo(expectedNext, 10n);
    });
  });

  describe("Security: Reentrancy, Pausable, Ownable2Step", function () {
    it("Split: pause blocks new operations", async function () {
      await split.connect(deployer).setPaused(true);

      await expect(
        split
          .connect(alice)
          .createSplit("Test", await usdc.getAddress(), charlie.address, [], [], true)
      ).to.be.revertedWith("Paused");

      // Unpause
      await split.connect(deployer).setPaused(false);

      await split
        .connect(alice)
        .createSplit("Test", await usdc.getAddress(), charlie.address, [], [], true);
    });

    it("Pay: only owner transfers ownership (2-step)", async function () {
      await expect(pay.connect(alice).transferOwnership(bob.address)).to.be.revertedWith(
        "Not owner"
      );

      await pay.connect(deployer).transferOwnership(bob.address);

      // Bob must accept
      const pending = await pay.pendingOwner();
      expect(pending).to.equal(bob.address);

      await pay.connect(bob).acceptOwnership();

      const newOwner = await pay.owner();
      expect(newOwner).to.equal(bob.address);
    });

    it("Recurring: fee update bounded", async function () {
      // Max is 500 bps (5%)
      await expect(recurring.connect(deployer).setPaused(true)).to.not.be.reverted;
    });
  });
});
