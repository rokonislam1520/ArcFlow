// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowSwap - Stablecoin AMM
 * @notice Constant-product AMM optimized for stablecoin swaps (low slippage)
 * @dev Supports USDC/USDT/DAI/EURC pairs with 0.3% fee
 *
 *      Reserves are stored in canonical (sorted) token order: `token0 < token1`.
 *      Caller-supplied token arguments may be in any order; every entry point
 *      normalises them against `pool.token0` before touching reserves.
 */
contract ArcFlowSwap {
    address public owner;

    // Fee: 0.3% (30 basis points)
    uint256 public constant FEE_BPS = 30;
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Pool: keccak(token0, token1) => Pool
    struct Pool {
        address token0; // canonical: token0 < token1
        address token1;
        uint256 reserve0; // reserve of token0
        uint256 reserve1; // reserve of token1
        uint256 totalLP;
        bool exists;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => uint256)) public lpBalances;

    // Whitelisted tokens (only stablecoins)
    mapping(address => bool) public whitelisted;

    // Reentrancy guard (1 = unlocked, 2 = locked)
    uint256 private _lock = 1;

    event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, bytes32 poolId, uint256 amountA, uint256 amountB, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, bytes32 poolId, uint256 amountA, uint256 amountB);
    event PoolCreated(bytes32 poolId, address tokenA, address tokenB);
    event TokenWhitelisted(address indexed token, bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier ensure(uint256 deadline) {
        require(block.timestamp <= deadline, "Expired");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "Reentrant call");
        _lock = 2;
        _;
        _lock = 1;
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

        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        pools[poolId] = Pool({
            token0: token0,
            token1: token1,
            reserve0: 0,
            reserve1: 0,
            totalLP: 0,
            exists: true
        });

        emit PoolCreated(poolId, token0, token1);
    }

    function whitelistToken(address token) external onlyOwner {
        require(token != address(0), "Zero address");
        whitelisted[token] = true;
        emit TokenWhitelisted(token, true);
    }

    // ========== Swap ==========
    /**
     * @param minAmountOut Minimum acceptable output; reverts if the swap would
     *                     return less (slippage / sandwich protection).
     * @param deadline     Unix timestamp after which the swap is no longer valid.
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        require(tokenIn != tokenOut, "Same token");
        require(whitelisted[tokenIn] && whitelisted[tokenOut], "Token not whitelisted");

        bytes32 poolId = _getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");

        bool inIsToken0 = tokenIn == pool.token0;
        uint256 reserveIn = inIsToken0 ? pool.reserve0 : pool.reserve1;
        uint256 reserveOut = inIsToken0 ? pool.reserve1 : pool.reserve0;
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        amountOut = _quote(amountIn, reserveIn, reserveOut);
        require(amountOut > 0, "Insufficient output");
        require(amountOut >= minAmountOut, "Slippage exceeded");

        // Effects before interactions (checks-effects-interactions)
        if (inIsToken0) {
            pool.reserve0 = reserveIn + amountIn;
            pool.reserve1 = reserveOut - amountOut;
        } else {
            pool.reserve1 = reserveIn + amountIn;
            pool.reserve0 = reserveOut - amountOut;
        }

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer in failed");
        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "Transfer out failed");

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ========== Add Liquidity ==========
    /**
     * @notice Deposits liquidity at the pool's current ratio. Any excess over the
     *         ratio is *not* pulled from the caller, so no value is donated to
     *         existing LPs.
     * @param amountADesired Maximum amount of tokenA the caller will deposit.
     * @param amountBDesired Maximum amount of tokenB the caller will deposit.
     * @param amountAMin     Minimum tokenA actually deposited (slippage bound).
     * @param amountBMin     Minimum tokenB actually deposited (slippage bound).
     * @return amountA   tokenA actually deposited
     * @return amountB   tokenB actually deposited
     * @return liquidity LP tokens minted
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    )
        external
        ensure(deadline)
        nonReentrant
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        require(tokenA != tokenB, "Same token");
        require(amountADesired > 0 && amountBDesired > 0, "Zero amounts");

        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");

        bool aIsToken0 = tokenA == pool.token0;

        (amountA, amountB, liquidity) = _computeDeposit(
            pool,
            aIsToken0,
            amountADesired,
            amountBDesired
        );

        require(amountA > 0 && amountB > 0, "Zero amounts");
        require(amountA >= amountAMin && amountB >= amountBMin, "Slippage exceeded");
        require(liquidity > 0, "Insufficient liquidity minted");

        // Effects before interactions
        if (aIsToken0) {
            pool.reserve0 += amountA;
            pool.reserve1 += amountB;
        } else {
            pool.reserve1 += amountA;
            pool.reserve0 += amountB;
        }
        pool.totalLP += liquidity;
        lpBalances[poolId][msg.sender] += liquidity;

        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "Transfer A failed");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "Transfer B failed");

        emit LiquidityAdded(msg.sender, poolId, amountA, amountB, liquidity);
    }

    // ========== Remove Liquidity ==========
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    )
        external
        ensure(deadline)
        nonReentrant
        returns (uint256 amountA, uint256 amountB)
    {
        require(tokenA != tokenB, "Same token");
        require(liquidity > 0, "Zero liquidity");

        bytes32 poolId = _getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool not found");
        require(lpBalances[poolId][msg.sender] >= liquidity, "Insufficient LP balance");

        bool aIsToken0 = tokenA == pool.token0;

        {
            uint256 reserveA = aIsToken0 ? pool.reserve0 : pool.reserve1;
            uint256 reserveB = aIsToken0 ? pool.reserve1 : pool.reserve0;
            amountA = (liquidity * reserveA) / pool.totalLP;
            amountB = (liquidity * reserveB) / pool.totalLP;
        }
        require(amountA > 0 && amountB > 0, "Insufficient liquidity burned");
        require(amountA >= amountAMin && amountB >= amountBMin, "Slippage exceeded");

        // Effects before interactions
        lpBalances[poolId][msg.sender] -= liquidity;
        pool.totalLP -= liquidity;
        if (aIsToken0) {
            pool.reserve0 -= amountA;
            pool.reserve1 -= amountB;
        } else {
            pool.reserve1 -= amountA;
            pool.reserve0 -= amountB;
        }

        require(IERC20(tokenA).transfer(msg.sender, amountA), "Transfer A failed");
        require(IERC20(tokenB).transfer(msg.sender, amountB), "Transfer B failed");

        emit LiquidityRemoved(msg.sender, poolId, amountA, amountB);
    }

    // ========== View Functions ==========
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == tokenOut || amountIn == 0) return 0;

        Pool storage pool = pools[_getPoolId(tokenIn, tokenOut)];
        if (!pool.exists) return 0;

        bool inIsToken0 = tokenIn == pool.token0;
        uint256 reserveIn = inIsToken0 ? pool.reserve0 : pool.reserve1;
        uint256 reserveOut = inIsToken0 ? pool.reserve1 : pool.reserve0;
        if (reserveIn == 0 || reserveOut == 0) return 0;

        return _quote(amountIn, reserveIn, reserveOut);
    }

    /// @return reserveA Reserve of `tokenA`, @return reserveB Reserve of `tokenB` (caller's order)
    function getReserves(address tokenA, address tokenB) external view returns (uint256 reserveA, uint256 reserveB) {
        Pool storage pool = pools[_getPoolId(tokenA, tokenB)];
        if (!pool.exists) return (0, 0);

        return tokenA == pool.token0
            ? (pool.reserve0, pool.reserve1)
            : (pool.reserve1, pool.reserve0);
    }

    function getLPBalance(address tokenA, address tokenB, address user) external view returns (uint256) {
        return lpBalances[_getPoolId(tokenA, tokenB)][user];
    }

    function getPoolId(address tokenA, address tokenB) external pure returns (bytes32) {
        return _getPoolId(tokenA, tokenB);
    }

    // ========== Internal ==========
    /**
     * @dev Split out of {addLiquidity} to keep that function under the EVM's
     *      16-slot stack limit. Returns the ratio-adjusted deposit amounts and
     *      the LP tokens they mint.
     */
    function _computeDeposit(
        Pool storage pool,
        bool aIsToken0,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal view returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        uint256 reserveA = aIsToken0 ? pool.reserve0 : pool.reserve1;
        uint256 reserveB = aIsToken0 ? pool.reserve1 : pool.reserve0;
        uint256 totalLP = pool.totalLP;

        if (totalLP == 0 || reserveA == 0 || reserveB == 0) {
            // First deposit sets the ratio
            return (amountADesired, amountBDesired, _sqrt(amountADesired * amountBDesired));
        }

        uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
        if (amountBOptimal <= amountBDesired) {
            amountA = amountADesired;
            amountB = amountBOptimal;
        } else {
            uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
            require(amountAOptimal <= amountADesired, "Ratio error");
            amountA = amountAOptimal;
            amountB = amountBDesired;
        }

        uint256 liqA = (amountA * totalLP) / reserveA;
        uint256 liqB = (amountB * totalLP) / reserveB;
        liquidity = liqA < liqB ? liqA : liqB;
    }

    function _quote(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        // amountOut = (amountIn * 9970 * reserveOut) / (reserveIn * 10000 + amountIn * 9970)
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

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
