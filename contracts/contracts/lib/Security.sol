// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC20.sol";

/**
 * @title SafeERC20
 * @notice Token calls that tolerate non-standard ERC-20 implementations.
 *
 * @dev The widely used pattern `require(token.transferFrom(...), "failed")` is
 *      broken for tokens that return no value. USDT on Ethereum mainnet is the
 *      canonical example: its `transferFrom` has no return data, so the ABI
 *      decoder reverts even when the transfer itself succeeded. Any contract
 *      using the naive pattern is permanently unusable with those tokens.
 *
 *      These helpers use a low-level call and accept two outcomes as success:
 *      empty return data (non-standard token, no revert) or a decoded `true`.
 *      Anything else reverts.
 */
library SafeERC20 {
    /// @dev Reverts unless the call succeeded and returned either nothing or true.
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        (bool ok, bytes memory returndata) = address(token).call(data);

        if (!ok) {
            // Bubble up the token's own revert reason when it gave one; a bare
            // "transfer failed" would hide the actual cause (e.g. blacklisting).
            if (returndata.length > 0) {
                assembly {
                    revert(add(32, returndata), mload(returndata))
                }
            }
            revert("SafeERC20: call failed");
        }

        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "SafeERC20: operation returned false");
        }
        // Empty return data with a successful call: non-standard but valid.
    }

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(
            token,
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
    }
}

/**
 * @title ReentrancyGuard
 * @notice Blocks nested calls into guarded functions.
 *
 * @dev These contracts move arbitrary ERC-20s, and a token with transfer hooks
 *      (ERC-777, or any token with a callback) can re-enter mid-transfer.
 *      Checks-effects-interactions is followed everywhere as the primary
 *      defence; this guard is the backstop for cross-function reentrancy, which
 *      CEI alone does not prevent.
 */
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "Reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/**
 * @title Ownable2Step
 * @notice Ownership transfer that requires the new owner to accept.
 *
 * @dev Single-step transfer permanently bricks admin functions if the address
 *      is mistyped. Requiring acceptance proves the target key exists and can
 *      sign before control moves.
 */
abstract contract Ownable2Step {
    address public owner;
    address public pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }
}

/**
 * @title Pausable
 * @notice Emergency stop for state-changing entry points.
 *
 * @dev Deliberately one-directional in effect: pausing blocks new activity but
 *      never blocks users from recovering their own funds. Functions that only
 *      release value back to its owner stay callable while paused, so the
 *      switch cannot be used to trap deposits.
 */
abstract contract Pausable {
    bool public paused;

    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    function _setPaused(bool value) internal {
        paused = value;
        if (value) emit Paused(msg.sender);
        else emit Unpaused(msg.sender);
    }
}
