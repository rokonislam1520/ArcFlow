// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/**
 * @title ArcFlowSplit - Bill Splitting Contract
 * @notice Split expenses among friends, track who paid and who owes
 * @dev Group-based bill splitting with settlement
 */
contract ArcFlowSplit {
    address public owner;
    IERC20 public usdc;

    enum SplitStatus { Active, Partial, Settled }

    struct SplitGroup {
        address creator;
        string name;
        uint256 totalAmount;
        uint256 memberCount;
        uint256 settledCount;
        SplitStatus status;
        uint256 createdAt;
    }

    struct Member {
        address wallet;
        uint256 share; // Amount owed (in USDC units)
        bool paid;
        uint256 paidAt;
    }

    SplitGroup[] public groups;
    mapping(uint256 => Member[]) public groupMembers; // groupId => members
    mapping(uint256 => mapping(address => bool)) public isMember;

    event GroupCreated(uint256 indexed groupId, address indexed creator, string name, uint256 totalAmount);
    event MemberAdded(uint256 indexed groupId, address indexed member, uint256 share);
    event Settled(uint256 indexed groupId, address indexed member, uint256 amount);
    event GroupSettled(uint256 indexed groupId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }

    // ========== Create Split ==========
    function createSplit(
        string calldata name,
        address[] calldata members,
        uint256[] calldata shares,
        address recipient
    ) external returns (uint256 groupId) {
        require(members.length == shares.length, "Length mismatch");
        require(members.length > 0, "No members");
        require(members.length <= 50, "Too many members");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            require(shares[i] > 0, "Zero share");
            totalAmount += shares[i];
            require(!isMember[groups.length][members[i]], "Duplicate member");
        }

        groupId = groups.length;

        groups.push(SplitGroup({
            creator: msg.sender,
            name: name,
            totalAmount: totalAmount,
            memberCount: members.length,
            settledCount: 0,
            status: SplitStatus.Active,
            createdAt: block.timestamp
        }));

        for (uint256 i = 0; i < members.length; i++) {
            groupMembers[groupId].push(Member({
                wallet: members[i],
                share: shares[i],
                paid: false,
                paidAt: 0
            }));
            isMember[groupId][members[i]] = true;
            emit MemberAdded(groupId, members[i], shares[i]);
        }

        emit GroupCreated(groupId, msg.sender, name, totalAmount);
    }

    // ========== Settle Share ==========
    function settleShare(uint256 groupId, address recipient) external {
        SplitGroup storage group = groups[groupId];
        require(group.status != SplitStatus.Settled, "Already settled");
        require(isMember[groupId][msg.sender], "Not a member");

        Member[] storage members = groupMembers[groupId];
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i].wallet == msg.sender) {
                require(!members[i].paid, "Already paid");

                // Transfer share to recipient
                require(usdc.transferFrom(msg.sender, recipient, members[i].share), "Transfer failed");

                members[i].paid = true;
                members[i].paidAt = block.timestamp;
                group.settledCount++;

                // Update status
                if (group.settledCount == group.memberCount) {
                    group.status = SplitStatus.Settled;
                    emit GroupSettled(groupId);
                } else {
                    group.status = SplitStatus.Partial;
                }

                emit Settled(groupId, msg.sender, members[i].share);
                return;
            }
        }
    }

    // ========== View ==========
    function getGroup(uint256 groupId) external view returns (
        address creator, string memory name, uint256 totalAmount,
        uint256 memberCount, uint256 settledCount, SplitStatus status
    ) {
        SplitGroup storage g = groups[groupId];
        return (g.creator, g.name, g.totalAmount, g.memberCount, g.settledCount, g.status);
    }

    function getGroupMembers(uint256 groupId) external view returns (
        address[] memory wallets, uint256[] memory shares, bool[] memory paid
    ) {
        Member[] storage members = groupMembers[groupId];
        uint256 len = members.length;
        wallets = new address[](len);
        shares = new uint256[](len);
        paid = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            wallets[i] = members[i].wallet;
            shares[i] = members[i].share;
            paid[i] = members[i].paid;
        }
    }

    function getUserGroups(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < groups.length; i++) {
            if (isMember[i][user]) count++;
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < groups.length; i++) {
            if (isMember[i][user]) {
                result[idx] = i;
                idx++;
            }
        }
        return result;
    }

    function getGroupCount() external view returns (uint256) {
        return groups.length;
    }
}
