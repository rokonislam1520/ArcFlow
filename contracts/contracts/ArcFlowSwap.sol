// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowSwap - Stablecoin AMM
 * @notice Constant-product AMM optimized for stablecoin swaps (low slippage)
 * @dev Supports USDC/USDT/DAI/EURC pairs with 0.3% fee
 */
contract ArcFlowSwap {
    address public owner;

    // Fee: 0.3% (30 basis points)
    uint256 public constant FEE_BPS = 30;
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Pool: keccak(tokenA, tokenB) => Pool
    struct Pool {
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalLP;
        bool exists;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public lpBalances;

    // Whitelisted tokens (only stablecoins)
    mapping(address => bool) public whitelisted;

    event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, bytes32 poolId, uint256 amountA, uint256 amountB, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, bytes32 poolId, uint256 amountA, uint256 amountB);
    event PoolCreated(bytes32 poolId, address tokenA, address tokenB);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ========== Pool Management ==========
    function createPool(address tokenA, address tokenB) external onlyOwner {
        require(tokenA != tokenB, "Same token");
        require(whitelisted[tokenA] && whitelisted[tokenB], "Token not whitelisted");

        bytes32 poolId = _getPoolId(tokenA, tokenB);
        require(!pools[poolId].exists, "Pool exists");

        pools[poolId] = Pool({
            reserveA: 0,
            reserveB: 0,
            totalLP: 0,
            exists: true
        });

        emit PoolCreated(poolId, tokenA, tokenB);
    }

    function whitelistToken(address token) external onlyOwner {
        whitelisted[token] = true;
    }

    // ========== Swap ==========
    function swap(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        require(whitelisted[tokenIn] && whitelisted[tokenOut], "Token not whitelisted");

        (address tokenA, address tokenB) = _sortTokens(tokenIn, tokenOut);
        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");

        uint256 reserveIn;
        uint256 reserveOut;
        if (tokenIn == tokenA) {
            reserveIn = pool.reserveA;
            reserveOut = pool.reserveB;
        } else {
            reserveIn = pool.reserveB;
            reserveOut = pool.reserveA;
        }

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // Calculate output: (amountIn * 997 * reserveOut) / (reserveIn * 10000 + amountIn * 997)
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
        require(amountOut > 0, "Insufficient output");

        // Transfer tokens
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer in failed");
        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "Transfer out failed");

        // Update reserves
        if (tokenIn == tokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveB += amountIn;
            pool.reserveA -= amountOut;
        }

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ========== Add Liquidity ==========
    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external returns (uint256 liquidity) {
        require(amountA > 0 && amountB > 0, "Zero amounts");

        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");

        // Calculate LP tokens
        if (pool.totalLP == 0) {
            liquidity = _sqrt(amountA * amountB);
        } else {
            uint256 liqA = (amountA * pool.totalLP) / pool.reserveA;
            uint256 liqB = (amountB * pool.totalLP) / pool.reserveB;
            liquidity = liqA < liqB ? liqA : liqB;
        }

        require(liquidity > 0, "Insufficient liquidity minted");

        // Transfer tokens in
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "Transfer A failed");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "Transfer B failed");

        // Update state
        pool.reserveA += amountA;
        pool.reserveB += amountB;
        pool.totalLP += liquidity;
        lpBalances[poolId][msg.sender] += liquidity;

        emit LiquidityAdded(msg.sender, poolId, amountA, amountB, liquidity);
    }

    // ========== Remove Liquidity ==========
    function removeLiquidity(address tokenA, address tokenB, uint256 liquidity) external returns (uint256 amountA, uint256 amountB) {
        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");
        require(lpBalances[poolId][msg.sender] >= liquidity, "Insufficient LP balance");

        amountA = (liquidity * pool.reserveA) / pool.totalLP;
        amountB = (liquidity * pool.reserveB) / pool.totalLP;
        require(amountA > 0 && amountB > 0, "Insufficient liquidity burned");

        lpBalances[poolId][msg.sender] -= liquidity;
        pool.totalLP -= liquidity;
        pool.reserveA -= amountA;
        pool.reserveB -= amountB;

        require(IERC20(tokenA).transfer(msg.sender, amountA), "Transfer A failed");
        require(IERC20(tokenB).transfer(msg.sender, amountB), "Transfer B failed");

        emit LiquidityRemoved(msg.sender, poolId, amountA, amountB);
    }

    // ========== View Functions ==========
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        (address tokenA, address tokenB) = _sortTokens(tokenIn, tokenOut);
        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];

        uint256 reserveIn = tokenIn == tokenA ? pool.reserveA : pool.reserveB;
        uint256 reserveOut = tokenIn == tokenA ? pool.reserveB : pool.reserveA;

        if (reserveIn == 0 || reserveOut == 0) return 0;

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function getReserves(address tokenA, address tokenB) external view returns (uint256, uint256) {
        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        return (pool.reserveA, pool.reserveB);
    }

    function getLPBalance(address tokenA, address tokenB, address user) external view returns (uint256) {
        bytes32 poolId = _getPoolId(tokenA, tokenB);
        return lpBalances[poolId][user];
    }

    // ========== Internal ==========
    function _getPoolId(address tokenA, address tokenB) internal pure returns (bytes32) {
        (address a, address b) = _sortTokens(tokenA, tokenB);
        return keccak256(abi.encodePacked(a, b));
    }

    function _sortTokens(address a, address b) internal pure returns (address, address) {
        return a < b ? (a, b) : (b, a);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
