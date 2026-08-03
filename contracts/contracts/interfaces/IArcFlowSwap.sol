// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcFlowSwap {
    function swap(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 amountOut);
    function addLiquidity(address tokenA, address tokenB, uint256 amountA, uint256 amountB) external returns (uint256 liquidity);
    function removeLiquidity(address tokenA, address tokenB, uint256 liquidity) external returns (uint256 amountA, uint256 amountB);
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
    function getPrice(address tokenA, address tokenB) external view returns (uint256);

    event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, address tokenA, address tokenB, uint256 amountA, uint256 amountB);
    event LiquidityRemoved(address indexed provider, address tokenA, address tokenB, uint256 amountA, uint256 amountB);
}
