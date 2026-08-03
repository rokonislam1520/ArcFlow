// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowRecurring - Automated Recurring Payments
 * @notice Schedule recurring USDC payments (subscriptions, rent, salary)
 * @dev Anyone can execute due payments (keeper pattern)
 */
contract ArcFlowRecurring {
    address public owner;
    IERC20 public usdc;

    enum Frequency { Weekly, Monthly, Quarterly, Yearly }

    /**
     * @dev Field order is chosen so `payer` + `frequency` + `maxExecutions`
     *      + `executions` + `active` pack into a single 32-byte slot
     *      (20 + 1 + 4 + 4 + 1 = 30 bytes).
     */
    struct RecurringPayment {
        address payer;
        Frequency frequency;
        uint32 maxExecutions; // 0 = unlimited
        uint32 executions;
        bool active;
        address payee;
        uint256 amount;
        uint256 startTime;
        uint256 nextPayment;
        uint256 totalPaid;
        string name;
    }

    RecurringPayment[] public payments;
    mapping(address => uint256[]) public userPayments;
    mapping(address => uint256[]) public payeePayments;

    event RecurringCreated(uint256 indexed paymentId, address indexed payer, address indexed payee, uint256 amount);
    event RecurringExecuted(uint256 indexed paymentId, address indexed payer, address indexed payee, uint256 amount);
    event RecurringCancelled(uint256 indexed paymentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "Zero USDC address");
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }

    // ========== Create Recurring ==========
    function createRecurring(
        address payee,
        uint256 amount,
        Frequency frequency,
        uint32 maxExecutions,
        string calldata name
    ) external returns (uint256 paymentId) {
        require(payee != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        require(payee != msg.sender, "Self payment");

        paymentId = payments.length;

        uint256 interval = _getInterval(frequency);

        payments.push(RecurringPayment({
            payer: msg.sender,
            frequency: frequency,
            maxExecutions: maxExecutions,
            executions: 0,
            active: true,
            payee: payee,
            amount: amount,
            startTime: block.timestamp,
            nextPayment: block.timestamp + interval,
            totalPaid: 0,
            name: name
        }));

        userPayments[msg.sender].push(paymentId);
        payeePayments[payee].push(paymentId);

        emit RecurringCreated(paymentId, msg.sender, payee, amount);
    }

    // ========== Execute Payment (anyone can call - keeper pattern) ==========
    /**
     * @dev `nextPayment` advances by whole intervals from the *scheduled* due
     *      date, not from `block.timestamp`. This keeps the schedule anchored to
     *      `startTime` so a late keeper cannot push the cadence forward and
     *      silently reduce the number of payments per year.
     *
     *      If more than one interval elapsed, the schedule fast-forwards to the
     *      next future slot rather than allowing unbounded catch-up executions
     *      that would drain the payer's allowance in a single block.
     */
    function executePayment(uint256 paymentId) external {
        RecurringPayment storage p = payments[paymentId];
        require(p.active, "Not active");
        require(block.timestamp >= p.nextPayment, "Not due yet");
        require(p.maxExecutions == 0 || p.executions < p.maxExecutions, "Max reached");

        uint256 interval = _getInterval(p.frequency);

        // Advance to the first slot strictly in the future, preserving cadence.
        uint256 next = p.nextPayment + interval;
        if (next <= block.timestamp) {
            uint256 missed = (block.timestamp - p.nextPayment) / interval;
            next = p.nextPayment + (missed + 1) * interval;
        }

        // Effects before interactions (checks-effects-interactions)
        p.executions++;
        p.totalPaid += p.amount;
        p.nextPayment = next;

        // Auto-deactivate if max reached
        if (p.maxExecutions > 0 && p.executions >= p.maxExecutions) {
            p.active = false;
        }

        // Transfer from payer to payee
        require(usdc.transferFrom(p.payer, p.payee, p.amount), "Transfer failed");

        emit RecurringExecuted(paymentId, p.payer, p.payee, p.amount);
    }

    // ========== Cancel ==========
    function cancelRecurring(uint256 paymentId) external {
        RecurringPayment storage p = payments[paymentId];
        require(msg.sender == p.payer || msg.sender == owner, "Not authorized");
        require(p.active, "Already cancelled");

        p.active = false;
        emit RecurringCancelled(paymentId);
    }

    // ========== View ==========
    function getPayment(uint256 paymentId) external view returns (
        address payer, address payee, uint256 amount, Frequency frequency,
        uint256 nextPayment, uint256 totalPaid, uint32 executions, bool active, string memory name
    ) {
        RecurringPayment storage p = payments[paymentId];
        return (p.payer, p.payee, p.amount, p.frequency, p.nextPayment, p.totalPaid, p.executions, p.active, p.name);
    }

    function getUserPayments(address user) external view returns (uint256[] memory) {
        return userPayments[user];
    }

    /// @notice Recurring payments where `user` is the *recipient*.
    function getPayeePayments(address user) external view returns (uint256[] memory) {
        return payeePayments[user];
    }

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function isDue(uint256 paymentId) external view returns (bool) {
        RecurringPayment storage p = payments[paymentId];
        return p.active
            && block.timestamp >= p.nextPayment
            && (p.maxExecutions == 0 || p.executions < p.maxExecutions);
    }

    // ========== Internal ==========
    function _getInterval(Frequency f) internal pure returns (uint256) {
        if (f == Frequency.Weekly) return 7 days;
        if (f == Frequency.Monthly) return 30 days;
        if (f == Frequency.Quarterly) return 90 days;
        return 365 days; // Yearly
    }
}
