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
        address recipient; // Who gets paid when members settle (fixed at creation)
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
    // groupId => member => index in groupMembers[groupId] (O(1) settlement lookup)
    mapping(uint256 => mapping(address => uint256)) private _memberIndex;
    // user => groupIds they belong to (avoids scanning every group in views)
    mapping(address => uint256[]) private _userGroups;

    event GroupCreated(uint256 indexed groupId, address indexed creator, string name, uint256 totalAmount);
    event MemberAdded(uint256 indexed groupId, address indexed member, uint256 share);
    event Settled(uint256 indexed groupId, address indexed member, uint256 amount);
    event GroupSettled(uint256 indexed groupId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdc) {
        require(_usdc != address(0), "Zero USDC address");
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }

    // ========== Create Split ==========
    /**
     * @param recipient Address that receives every member's share. Stored on the
     *                  group so a settling member cannot redirect funds.
     */
    function createSplit(
        string calldata name,
        address[] calldata members,
        uint256[] calldata shares,
        address recipient
    ) external returns (uint256 groupId) {
        require(members.length == shares.length, "Length mismatch");
        require(members.length > 0, "No members");
        require(members.length <= 50, "Too many members");
        require(recipient != address(0), "Zero recipient");

        groupId = groups.length;

        groups.push(SplitGroup({
            creator: msg.sender,
            recipient: recipient,
            name: name,
            totalAmount: 0, // set below once shares are summed
            memberCount: members.length,
            settledCount: 0,
            status: SplitStatus.Active,
            createdAt: block.timestamp
        }));

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < members.length; i++) {
            address member = members[i];
            require(member != address(0), "Zero member");
            require(shares[i] > 0, "Zero share");
            // Marked inside this loop so duplicates *within the same call* are caught.
            require(!isMember[groupId][member], "Duplicate member");

            totalAmount += shares[i];

            _memberIndex[groupId][member] = groupMembers[groupId].length;
            groupMembers[groupId].push(Member({
                wallet: member,
                share: shares[i],
                paid: false,
                paidAt: 0
            }));
            isMember[groupId][member] = true;
            _userGroups[member].push(groupId);

            emit MemberAdded(groupId, member, shares[i]);
        }

        groups[groupId].totalAmount = totalAmount;

        emit GroupCreated(groupId, msg.sender, name, totalAmount);
    }

    // ========== Settle Share ==========
    /// @notice Pays the caller's share to the group's stored recipient.
    function settleShare(uint256 groupId) external {
        require(groupId < groups.length, "Invalid group");
        SplitGroup storage group = groups[groupId];
        require(group.status != SplitStatus.Settled, "Already settled");
        require(isMember[groupId][msg.sender], "Not a member");

        Member storage member = groupMembers[groupId][_memberIndex[groupId][msg.sender]];
        require(!member.paid, "Already paid");

        uint256 share = member.share;
        address recipient = group.recipient;

        // Effects before interactions (checks-effects-interactions)
        member.paid = true;
        member.paidAt = block.timestamp;
        group.settledCount++;

        if (group.settledCount == group.memberCount) {
            group.status = SplitStatus.Settled;
        } else {
            group.status = SplitStatus.Partial;
        }

        // Transfer share to the recipient fixed at creation time
        require(usdc.transferFrom(msg.sender, recipient, share), "Transfer failed");

        emit Settled(groupId, msg.sender, share);
        if (group.status == SplitStatus.Settled) {
            emit GroupSettled(groupId);
        }
    }

    // ========== View ==========
    function getGroup(uint256 groupId) external view returns (
        address creator, string memory name, uint256 totalAmount,
        uint256 memberCount, uint256 settledCount, SplitStatus status
    ) {
        require(groupId < groups.length, "Invalid group");
        SplitGroup storage g = groups[groupId];
        return (g.creator, g.name, g.totalAmount, g.memberCount, g.settledCount, g.status);
    }

    function getGroupRecipient(uint256 groupId) external view returns (address) {
        require(groupId < groups.length, "Invalid group");
        return groups[groupId].recipient;
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
        return _userGroups[user];
    }

    /// @notice The caller's outstanding share for a group (0 if paid or not a member).
    function getOutstandingShare(uint256 groupId, address user) external view returns (uint256) {
        if (groupId >= groups.length || !isMember[groupId][user]) return 0;
        Member storage member = groupMembers[groupId][_memberIndex[groupId][user]];
        return member.paid ? 0 : member.share;
    }

    function getGroupCount() external view returns (uint256) {
        return groups.length;
    }
}
