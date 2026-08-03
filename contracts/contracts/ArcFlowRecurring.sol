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

    struct RecurringPayment {
        address payer;
        address payee;
        uint256 amount;
        Frequency frequency;
        uint256 startTime;
        uint256 nextPayment;
        uint256 totalPaid;
        uint8 maxExecutions; // 0 = unlimited
        uint8 executions;
        bool active;
        string name;
    }

    RecurringPayment[] public payments;
    mapping(address => uint256[]) public userPayments;

    event RecurringCreated(uint256 indexed paymentId, address indexed payer, address indexed payee, uint256 amount);
    event RecurringExecuted(uint256 indexed paymentId, address indexed payer, address indexed payee, uint256 amount);
    event RecurringCancelled(uint256 indexed paymentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }

    // ========== Create Recurring ==========
    function createRecurring(
        address payee,
        uint256 amount,
        Frequency frequency,
        uint8 maxExecutions,
        string calldata name
    ) external returns (uint256 paymentId) {
        require(payee != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        require(payee != msg.sender, "Self payment");

        paymentId = payments.length;

        uint256 interval = _getInterval(frequency);

        payments.push(RecurringPayment({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            frequency: frequency,
            startTime: block.timestamp,
            nextPayment: block.timestamp + interval,
            totalPaid: 0,
            maxExecutions: maxExecutions,
            executions: 0,
            active: true,
            name: name
        }));

        userPayments[msg.sender].push(paymentId);

        emit RecurringCreated(paymentId, msg.sender, payee, amount);
    }

    // ========== Execute Payment (anyone can call - keeper pattern) ==========
    function executePayment(uint256 paymentId) external {
        RecurringPayment storage p = payments[paymentId];
        require(p.active, "Not active");
        require(block.timestamp >= p.nextPayment, "Not due yet");
        require(p.maxExecutions == 0 || p.executions < p.maxExecutions, "Max reached");

        // Transfer from payer to payee
        require(usdc.transferFrom(p.payer, p.payee, p.amount), "Transfer failed");

        p.executions++;
        p.totalPaid += p.amount;
        p.nextPayment = block.timestamp + _getInterval(p.frequency);

        // Auto-deactivate if max reached
        if (p.maxExecutions > 0 && p.executions >= p.maxExecutions) {
            p.active = false;
        }

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
        uint256 nextPayment, uint256 totalPaid, uint8 executions, bool active, string memory name
    ) {
        RecurringPayment storage p = payments[paymentId];
        return (p.payer, p.payee, p.amount, p.frequency, p.nextPayment, p.totalPaid, p.executions, p.active, p.name);
    }

    function getUserPayments(address user) external view returns (uint256[] memory) {
        return userPayments[user];
    }

    function getPaymentCount() external view returns (uint256) {
        return payments.length;
    }

    function isDue(uint256 paymentId) external view returns (bool) {
        RecurringPayment storage p = payments[paymentId];
        return p.active && block.timestamp >= p.nextPayment;
    }

    // ========== Internal ==========
    function _getInterval(Frequency f) internal pure returns (uint256) {
        if (f == Frequency.Weekly) return 7 days;
        if (f == Frequency.Monthly) return 30 days;
        if (f == Frequency.Quarterly) return 90 days;
        return 365 days; // Yearly
    }
}
