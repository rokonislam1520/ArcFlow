// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";
import "./lib/Security.sol";

/**
 * @title ArcFlowPay - Merchant payment system with receipts
 * @notice Merchants register, customers pay with any supported token, and every
 *         payment is recorded with a unique ID for verifiable history.
 *
 * @dev Merchant fee: the contract takes a small percentage (default 0.5%) from
 *      each payment to cover operations. The fee is transparent, deducted from
 *      the gross amount, and the merchant receives the net.
 *
 *      Multi-token support: customers may pay in any token; the merchant's
 *      on-chain ledger tracks totals per token. An off-chain integration or a
 *      future dashboard aggregates across tokens at current prices.
 */
contract ArcFlowPay is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Merchant {
        address wallet;
        string name;
        string category;
        bool active;
        uint64 registeredAt;
        // Total received in each token; viewed separately.
        mapping(address => uint256) totalReceivedByToken;
        uint256 paymentCount;
    }

    struct PaymentReceipt {
        uint256 id;
        address customer;
        address merchant;
        address token;
        uint256 grossAmount;
        uint256 fee;
        uint256 netAmount;
        uint64 timestamp;
        string memo; // optional customer note, e.g. "Invoice #1234"
    }

    /// @dev The next payment ID. Monotonic across all merchants/tokens.
    uint256 private _nextPaymentId;

    /// @dev `_payments[id]` is the full receipt.
    mapping(uint256 => PaymentReceipt) private _payments;

    /// @dev `_merchantPayments[merchant]` lists every payment ID received.
    mapping(address => uint256[]) private _merchantPayments;

    /// @dev `_customerPayments[customer]` lists every payment ID sent.
    mapping(address => uint256[]) private _customerPayments;

    mapping(address => Merchant) private _merchants;
    address[] private _merchantList;

    /// @dev Fee in basis points (0.01%). 50 = 0.5%. Capped at 5% (500 bps).
    uint256 public feeBps = 50;
    address public feeCollector;

    event MerchantRegistered(address indexed merchant, string name, string category);
    event MerchantDeactivated(address indexed merchant);
    event MerchantReactivated(address indexed merchant);
    event PaymentMade(
        uint256 indexed paymentId,
        address indexed customer,
        address indexed merchant,
        address token,
        uint256 grossAmount,
        uint256 fee,
        uint256 netAmount
    );
    event FeeUpdated(uint256 newFeeBps);
    event FeeCollectorUpdated(address indexed newCollector);

    constructor(address _feeCollector) Ownable2Step(msg.sender) {
        require(_feeCollector != address(0), "Zero fee collector");
        feeCollector = _feeCollector;
        _nextPaymentId = 1; // start IDs at 1 so 0 is reserved as "not found"
    }

    // ========================= Merchant registration =========================

    function registerMerchant(string calldata name, string calldata category) external whenNotPaused {
        require(bytes(name).length > 0, "Empty name");
        require(bytes(name).length <= 64, "Name too long");
        require(_merchants[msg.sender].wallet == address(0), "Already registered");

        Merchant storage m = _merchants[msg.sender];
        m.wallet = msg.sender;
        m.name = name;
        m.category = category;
        m.active = true;
        m.registeredAt = uint64(block.timestamp);
        m.paymentCount = 0;

        _merchantList.push(msg.sender);
        emit MerchantRegistered(msg.sender, name, category);
    }

    function deactivateMerchant(address merchant) external {
        require(msg.sender == owner || msg.sender == merchant, "Not authorized");
        Merchant storage m = _merchants[merchant];
        require(m.wallet != address(0), "Not registered");
        require(m.active, "Already inactive");

        m.active = false;
        emit MerchantDeactivated(merchant);
    }

    function reactivateMerchant() external {
        Merchant storage m = _merchants[msg.sender];
        require(m.wallet != address(0), "Not registered");
        require(!m.active, "Already active");

        m.active = true;
        emit MerchantReactivated(msg.sender);
    }

    // ========================= Payment =========================

    /**
     * @notice Pay a merchant in any token.
     * @param memo Optional short note attached to the receipt for bookkeeping.
     *
     * @dev Balance-diff pattern: measure the contract's token balance before and
     *      after the transfer to determine what actually arrived. This makes the
     *      contract safe for fee-on-transfer tokens, which deduct a cut in the
     *      `transferFrom` itself so `amount` would overstate what was received.
     */
    function pay(
        address merchant,
        address token,
        uint256 grossAmount,
        string calldata memo
    ) external whenNotPaused nonReentrant returns (uint256 paymentId) {
        require(grossAmount > 0, "Zero amount");
        require(token != address(0), "Zero token");
        require(bytes(memo).length <= 128, "Memo too long");

        Merchant storage m = _merchants[merchant];
        require(m.wallet != address(0), "Merchant not registered");
        require(m.active, "Merchant not active");

        IERC20 tokenContract = IERC20(token);
        uint256 before = tokenContract.balanceOf(address(this));
        tokenContract.safeTransferFrom(msg.sender, address(this), grossAmount);
        uint256 received = tokenContract.balanceOf(address(this)) - before;
        require(received > 0, "No tokens received");

        // Fee and net computed from what actually arrived, not from `grossAmount`.
        uint256 fee = (received * feeBps) / 10000;
        uint256 netAmount = received - fee;
        require(netAmount > 0, "Net amount zero");

        paymentId = _nextPaymentId++;

        _payments[paymentId] = PaymentReceipt({
            id: paymentId,
            customer: msg.sender,
            merchant: merchant,
            token: token,
            grossAmount: received,
            fee: fee,
            netAmount: netAmount,
            timestamp: uint64(block.timestamp),
            memo: memo
        });

        _merchantPayments[merchant].push(paymentId);
        _customerPayments[msg.sender].push(paymentId);

        m.totalReceivedByToken[token] += netAmount;
        m.paymentCount++;

        // Transfer net to merchant, fee to collector
        tokenContract.safeTransfer(merchant, netAmount);
        if (fee > 0) {
            tokenContract.safeTransfer(feeCollector, fee);
        }

        emit PaymentMade(paymentId, msg.sender, merchant, token, received, fee, netAmount);
    }

    // ========================= Views =========================

    function getMerchant(address wallet)
        external
        view
        returns (
            string memory name,
            string memory category,
            bool active,
            uint64 registeredAt,
            uint256 paymentCount
        )
    {
        Merchant storage m = _merchants[wallet];
        return (m.name, m.category, m.active, m.registeredAt, m.paymentCount);
    }

    /**
     * @notice How much a merchant has received in a specific token.
     * @dev To get total USD value, sum this across tokens using off-chain prices.
     */
    function getMerchantTotalByToken(address merchant, address token) external view returns (uint256) {
        return _merchants[merchant].totalReceivedByToken[token];
    }

    function getMerchantCount() external view returns (uint256) {
        return _merchantList.length;
    }

    function getMerchantList() external view returns (address[] memory) {
        return _merchantList;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _merchants[wallet].wallet != address(0);
    }

    function getPayment(uint256 paymentId)
        external
        view
        returns (
            address customer,
            address merchant,
            address token,
            uint256 grossAmount,
            uint256 fee,
            uint256 netAmount,
            uint64 timestamp,
            string memory memo
        )
    {
        PaymentReceipt storage r = _payments[paymentId];
        require(r.id == paymentId, "Payment not found");
        return (
            r.customer,
            r.merchant,
            r.token,
            r.grossAmount,
            r.fee,
            r.netAmount,
            r.timestamp,
            r.memo
        );
    }

    /**
     * @notice All payment IDs where `merchant` was the recipient.
     * @dev Unbounded in theory, but a realistic merchant receiving thousands of
     *      payments per day would accumulate ~1M entries per three years. The
     *      contract's own storage can handle it; if the array outgrows calldata
     *      limits, the frontend paginates by reading slices.
     */
    function getMerchantPayments(address merchant) external view returns (uint256[] memory) {
        return _merchantPayments[merchant];
    }

    function getCustomerPayments(address customer) external view returns (uint256[] memory) {
        return _customerPayments[customer];
    }

    function getNextPaymentId() external view returns (uint256) {
        return _nextPaymentId;
    }

    // ========================= Admin =========================

    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high");
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeCollector(address _collector) external onlyOwner {
        require(_collector != address(0), "Zero fee collector");
        feeCollector = _collector;
        emit FeeCollectorUpdated(_collector);
    }

    function setPaused(bool value) external onlyOwner {
        _setPaused(value);
    }
}
