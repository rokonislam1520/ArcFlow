// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowSend - Gasless USDC Transfers
 * @notice Relayer submits tx on behalf of user, user signs off-chain
 * @dev Uses EIP-712 meta-transactions for gasless sends
 */
contract ArcFlowSend {
    address public owner;
    IERC20 public usdc;

    // Relayer whitelist
    mapping(address => bool) public relayers;

    // Nonce per user to prevent replay
    mapping(address => uint256) public nonces;

    // Fee: 0.1% of transfer amount (basis points)
    uint256 public feeBps = 10; // 10 bps = 0.1%
    address public feeCollector;

    // Min transfer: $1 USDC
    uint256 public minTransfer = 1_000_000; // 6 decimals

    // Struct for meta-tx
    struct SendRequest {
        address from;
        address to;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant SEND_TYPEHASH = keccak256(
        "SendRequest(address from,address to,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    // Pre-computed EIP-712 domain constants (saves gas vs. hashing on every call)
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant _NAME_HASH = keccak256("ArcFlowSend");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    // Upper bound of a valid ECDSA `s` value (EIP-2) - guards signature malleability
    uint256 private constant _MAX_SIG_S =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    event Sent(address indexed from, address indexed to, uint256 amount, uint256 fee);
    event RelayerUpdated(address indexed relayer, bool status);
    event FeeUpdated(uint256 newFeeBps);
    event FeeCollectorUpdated(address indexed newCollector);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer");
        _;
    }

    constructor(address _usdc, address _feeCollector) {
        require(_usdc != address(0), "Zero USDC address");
        require(_feeCollector != address(0), "Zero fee collector");
        owner = msg.sender;
        usdc = IERC20(_usdc);
        feeCollector = _feeCollector;
    }

    // ========== Gasless Send via Meta-Tx ==========
    function sendWithSig(
        SendRequest calldata req,
        bytes calldata signature
    ) external onlyRelayer {
        require(req.to != address(0), "Zero address");
        require(block.timestamp <= req.deadline, "Expired");
        require(req.nonce == nonces[req.from], "Invalid nonce");
        require(req.amount >= minTransfer, "Below minimum");

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            SEND_TYPEHASH,
            req.from,
            req.to,
            req.amount,
            req.nonce,
            req.deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address signer = _recoverSigner(digest, signature);
        require(signer != address(0) && signer == req.from, "Invalid signature");

        nonces[req.from]++;

        uint256 fee = (req.amount * feeBps) / 10000;
        uint256 netAmount = req.amount - fee;

        // Transfer from user to recipient
        require(usdc.transferFrom(req.from, req.to, netAmount), "Transfer failed");

        // Collect fee
        if (fee > 0) {
            require(usdc.transferFrom(req.from, feeCollector, fee), "Fee transfer failed");
        }

        emit Sent(req.from, req.to, netAmount, fee);
    }

    // ========== Direct Send (user pays gas) ==========
    function send(address to, uint256 amount) external {
        require(to != address(0), "Zero address");
        require(amount >= minTransfer, "Below minimum");

        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;

        require(usdc.transferFrom(msg.sender, to, netAmount), "Transfer failed");

        if (fee > 0) {
            require(usdc.transferFrom(msg.sender, feeCollector, fee), "Fee transfer failed");
        }

        emit Sent(msg.sender, to, netAmount, fee);
    }

    // ========== Admin ==========
    function setRelayer(address relayer, bool status) external onlyOwner {
        relayers[relayer] = status;
        emit RelayerUpdated(relayer, status);
    }

    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high"); // Max 5%
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeCollector(address _collector) external onlyOwner {
        require(_collector != address(0), "Zero fee collector");
        feeCollector = _collector;
        emit FeeCollectorUpdated(_collector);
    }

    function withdraw() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        require(usdc.transfer(owner, balance), "Withdraw failed");
    }

    // ========== Helpers ==========
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            _EIP712_DOMAIN_TYPEHASH,
            _NAME_HASH,
            _VERSION_HASH,
            block.chainid,
            address(this)
        ));
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid v");
        require(uint256(s) <= _MAX_SIG_S, "Invalid sig s");
        return ecrecover(digest, v, r, s);
    }
}
