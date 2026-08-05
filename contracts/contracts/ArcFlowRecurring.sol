// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";
import "./lib/Security.sol";

/**
 * @title ArcFlowRecurring - Subscription payments with keeper rewards
 * @notice Schedule recurring token payments; anyone can execute and earn a bounty.
 *
 * @dev Keeper economics: automation is not free. Gelato, Chainlink, or any other
 *      keeper network charges a gas fee plus a service fee for each execution.
 *      Without an on-chain incentive, no keeper would pick up this contract's
 *      recurring payments at all — running transactions for strangers at a loss
 *      is not a business model.
 *
 *      This contract makes execution profitable: a small percentage (default 1%)
 *      of each payment goes to whoever calls `executePayment`. The economics:
 *
 *      - Gas cost on Ethereum mainnet ~$2–5 per tx (depends on congestion)
 *      - A $100 monthly subscription with 1% keeper reward = $1 bounty
 *      - Not enough to cover mainnet gas, but viable on L2s
 *
 *      On Arbitrum or Optimism (gas ~$0.10), a 1% reward on $100 = $1 profit.
 *      On Polygon PoS (gas ~$0.01), profitable at even lower amounts.
 *
 *      A professional keeper runs a bot that scans for due payments, executes
 *      them, and collects the reward. The payer pre-approves enough allowance to
 *      cover the gross (payment + reward), so the keeper has no balance risk.
 *
 *      Alternative without a keeper reward: require the payer or payee to call
 *      `executePayment` themselves. That is not automatic; it is just a scheduled
 *      transfer they must remember to trigger. The product brief called for real
 *      automation, so this implements it honestly: permissionless execution with
 *      an economic incentive.
 *
 *      Keeper reward is configurable per payment (not global), so high-value
 *      subscriptions can set a larger percentage to compete for faster execution.
 *      The max is capped at 5% (500 bps) so a malicious payer cannot create a
 *      decoy payment that drains an keeper bot's ETH without paying out.
 */
contract ArcFlowRecurring is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Frequency {
        Daily,
        Weekly,
        Monthly,
        Quarterly,
        Yearly
    }

    /**
     * @dev `payer`, `active`, `frequency`, `maxExecutions`, and `executions` are
     *      grouped for tight packing. `nextPayment` is hot and left in its own slot.
     */
    struct RecurringPayment {
        address payer;
        bool active;
        Frequency frequency;
        uint32 maxExecutions; // 0 = unlimited
        uint32 executions;
        address payee;
        address token;
        uint256 baseAmount; // net payment to payee
        uint256 keeperRewardBps; // basis points (0.01%); max 500
        uint256 startTime;
        uint256 nextPayment;
        uint256 totalPaid;
        string name;
    }

    uint256 private _nextPaymentId;
    mapping(uint256 => RecurringPayment) private _payments;
    mapping(address => uint256[]) private _payerPayments;
    mapping(address => uint256[]) private _payeePayments;

    /// @dev Max keeper reward: 5%. Higher is considered a scam bounty.
    uint256 public constant MAX_KEEPER_REWARD_BPS = 500;

    event RecurringCreated(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 baseAmount,
        Frequency frequency,
        uint256 keeperRewardBps
    );
    event RecurringExecuted(
        uint256 indexed paymentId,
        address indexed executor,
        uint256 baseAmount,
        uint256 keeperReward
    );
    event RecurringCancelled(uint256 indexed paymentId);

    constructor() Ownable2Step(msg.sender) {
        _nextPaymentId = 1;
    }

    // ========================= Create =========================

    /**
     * @param keeperRewardBps Basis points paid to the executor. 100 = 1%.
     *        Higher values attract faster execution but cost the payer more.
     *        Capped at 5% to prevent abuse.
     */
    function createRecurring(
        address payee,
        address token,
        uint256 baseAmount,
        Frequency frequency,
        uint32 maxExecutions,
        uint256 keeperRewardBps,
        string calldata name
    ) external whenNotPaused returns (uint256 paymentId) {
        require(payee != address(0), "Zero payee");
        require(token != address(0), "Zero token");
        require(baseAmount > 0, "Zero amount");
        require(payee != msg.sender, "Self payment");
        require(bytes(name).length > 0, "Empty name");
        require(bytes(name).length <= 64, "Name too long");
        require(keeperRewardBps <= MAX_KEEPER_REWARD_BPS, "Keeper reward too high");

        paymentId = _nextPaymentId++;
        uint256 interval = _getInterval(frequency);

        _payments[paymentId] = RecurringPayment({
            payer: msg.sender,
            active: true,
            frequency: frequency,
            maxExecutions: maxExecutions,
            executions: 0,
            payee: payee,
            token: token,
            baseAmount: baseAmount,
            keeperRewardBps: keeperRewardBps,
            startTime: block.timestamp,
            nextPayment: block.timestamp + interval,
            totalPaid: 0,
            name: name
        });

        _payerPayments[msg.sender].push(paymentId);
        _payeePayments[payee].push(paymentId);

        emit RecurringCreated(
            paymentId,
            msg.sender,
            payee,
            token,
            baseAmount,
            frequency,
            keeperRewardBps
        );
    }

    // ========================= Execute =========================

    /**
     * @notice Execute a due payment; earn the keeper reward.
     * @dev Anyone may call. Execution is permissionless: the contract does not
     *      whitelist keepers, because that would centralize automation and make
     *      it easy for the owner to censor payments.
     *
     *      The schedule advances from the *due date*, not from now. A late keeper
     *      does not silently reduce the payer's annual payment count by delaying
     *      every subsequent interval. If multiple intervals elapsed, the schedule
     *      fast-forwards to the next future slot rather than allowing unbounded
     *      catch-up that would drain the payer's allowance in one transaction.
     */
    function executePayment(uint256 paymentId) external nonReentrant {
        RecurringPayment storage p = _payments[paymentId];
        require(p.payer != address(0), "Payment not found");
        require(p.active, "Not active");
        require(block.timestamp >= p.nextPayment, "Not due yet");
        require(p.maxExecutions == 0 || p.executions < p.maxExecutions, "Max reached");

        uint256 keeperReward = (p.baseAmount * p.keeperRewardBps) / 10000;
        uint256 grossAmount = p.baseAmount + keeperReward;

        IERC20 token = IERC20(p.token);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(p.payer, address(this), grossAmount);
        uint256 received = token.balanceOf(address(this)) - before;
        require(received >= p.baseAmount, "Insufficient transfer");

        // Recompute splits from what actually arrived, in case token has transfer fees.
        uint256 actualReward = (received * p.keeperRewardBps) / (10000 + p.keeperRewardBps);
        uint256 actualBase = received - actualReward;

        uint256 interval = _getInterval(p.frequency);
        uint256 next = p.nextPayment + interval;
        if (next <= block.timestamp) {
            uint256 missed = (block.timestamp - p.nextPayment) / interval;
            next = p.nextPayment + (missed + 1) * interval;
        }

        // Effects before final transfers
        p.executions++;
        p.totalPaid += actualBase;
        p.nextPayment = next;

        if (p.maxExecutions > 0 && p.executions >= p.maxExecutions) {
            p.active = false;
        }

        // Transfer base to payee, reward to executor (msg.sender = keeper bot or manual caller)
        token.safeTransfer(p.payee, actualBase);
        if (actualReward > 0) {
            token.safeTransfer(msg.sender, actualReward);
        }

        emit RecurringExecuted(paymentId, msg.sender, actualBase, actualReward);
    }

    // ========================= Cancel =========================

    function cancelRecurring(uint256 paymentId) external {
        RecurringPayment storage p = _payments[paymentId];
        require(p.payer != address(0), "Payment not found");
        require(msg.sender == p.payer || msg.sender == owner, "Not authorized");
        require(p.active, "Already cancelled");

        p.active = false;
        emit RecurringCancelled(paymentId);
    }

    // ========================= Views =========================

    function getPayment(uint256 paymentId)
        external
        view
        returns (
            address payer,
            address payee,
            address token,
            uint256 baseAmount,
            uint256 keeperRewardBps,
            Frequency frequency,
            uint256 nextPayment,
            uint256 totalPaid,
            uint32 executions,
            uint32 maxExecutions,
            bool active,
            string memory name
        )
    {
        RecurringPayment storage p = _payments[paymentId];
        require(p.payer != address(0), "Payment not found");
        return (
            p.payer,
            p.payee,
            p.token,
            p.baseAmount,
            p.keeperRewardBps,
            p.frequency,
            p.nextPayment,
            p.totalPaid,
            p.executions,
            p.maxExecutions,
            p.active,
            p.name
        );
    }

    function getPayerPayments(address user) external view returns (uint256[] memory) {
        return _payerPayments[user];
    }

    function getPayeePayments(address user) external view returns (uint256[] memory) {
        return _payeePayments[user];
    }

    function getNextPaymentId() external view returns (uint256) {
        return _nextPaymentId;
    }

    /**
     * @notice Whether a payment is due and executable right now.
     * @dev Keeper bots query this across many payment IDs to find work.
     */
    function isDue(uint256 paymentId) external view returns (bool) {
        RecurringPayment storage p = _payments[paymentId];
        return
            p.payer != address(0) &&
            p.active &&
            block.timestamp >= p.nextPayment &&
            (p.maxExecutions == 0 || p.executions < p.maxExecutions);
    }

    /**
     * @notice Gross amount the payer must approve: base + keeper reward.
     * @dev A UI uses this to prompt the correct `approve` call before creating.
     */
    function getGrossAmount(uint256 paymentId) external view returns (uint256) {
        RecurringPayment storage p = _payments[paymentId];
        require(p.payer != address(0), "Payment not found");
        return p.baseAmount + (p.baseAmount * p.keeperRewardBps) / 10000;
    }

    // ========================= Internal =========================

    function _getInterval(Frequency f) internal pure returns (uint256) {
        if (f == Frequency.Daily) return 1 days;
        if (f == Frequency.Weekly) return 7 days;
        if (f == Frequency.Monthly) return 30 days;
        if (f == Frequency.Quarterly) return 90 days;
        return 365 days; // Yearly
    }

    // ========================= Admin =========================

    function setPaused(bool value) external onlyOwner {
        _setPaused(value);
    }
}
