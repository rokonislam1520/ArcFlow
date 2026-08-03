// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowPay - Merchant Payment System
 * @notice Merchants register, users pay with USDC via QR/address
 * @dev Instant settlement, 0.5% merchant fee
 */
contract ArcFlowPay {
    address public owner;
    IERC20 public usdc;

    struct Merchant {
        address wallet;
        string name;
        string category;
        bool active;
        uint256 totalReceived;
        uint256 txCount;
    }

    mapping(address => Merchant) public merchants;
    address[] public merchantList;

    // Fee: 0.5% paid by merchant on each payment
    uint256 public feeBps = 50;
    address public feeCollector;

    event MerchantRegistered(address indexed merchant, string name);
    event Payment(address indexed from, address indexed merchant, uint256 amount, uint256 fee);
    event MerchantDeactivated(address indexed merchant);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMerchant() {
        require(merchants[msg.sender].active, "Not active merchant");
        _;
    }

    constructor(address _usdc, address _feeCollector) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        feeCollector = _feeCollector;
    }

    // ========== Merchant Registration ==========
    function registerMerchant(string calldata name, string calldata category) external {
        require(!merchants[msg.sender].active, "Already registered");
        require(bytes(name).length > 0, "Empty name");

        merchants[msg.sender] = Merchant({
            wallet: msg.sender,
            name: name,
            category: category,
            active: true,
            totalReceived: 0,
            txCount: 0
        });

        merchantList.push(msg.sender);
        emit MerchantRegistered(msg.sender, name);
    }

    function deactivateMerchant(address merchant) external {
        require(msg.sender == owner || msg.sender == merchant, "Not authorized");
        merchants[merchant].active = false;
        emit MerchantDeactivated(merchant);
    }

    // ========== Payment ==========
    function pay(address merchant, uint256 amount) external {
        require(amount > 0, "Zero amount");
        require(merchants[merchant].active, "Merchant not active");

        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;

        // Transfer to merchant
        require(usdc.transferFrom(msg.sender, merchant, netAmount), "Transfer failed");

        // Collect fee
        if (fee > 0) {
            require(usdc.transferFrom(msg.sender, feeCollector, fee), "Fee failed");
        }

        merchants[merchant].totalReceived += netAmount;
        merchants[merchant].txCount++;

        emit Payment(msg.sender, merchant, amount, fee);
    }

    // ========== View ==========
    function getMerchant(address wallet) external view returns (string memory name, string memory category, bool active, uint256 totalReceived, uint256 txCount) {
        Merchant storage m = merchants[wallet];
        return (m.name, m.category, m.active, m.totalReceived, m.txCount);
    }

    function getMerchantCount() external view returns (uint256) {
        return merchantList.length;
    }

    // ========== Admin ==========
    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Too high");
        feeBps = _feeBps;
    }
}
