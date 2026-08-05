// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";
import "./lib/Security.sol";

/**
 * @title ArcFlowSplit - Group expense splitting with escrow
 * @notice Create a split, let members join, collect each share, then release
 *         the full amount to the recipient in one settlement.
 *
 * @dev Escrow rather than pass-through, and the reason matters:
 *
 *      A pass-through design (forward each share straight to the recipient)
 *      cannot express "settle" as a real operation — the group is just a
 *      counter, and a recipient receives N dribbles with no guarantee the group
 *      ever completes. Escrow makes the group atomic from the recipient's view:
 *      they receive the whole bill once, or the split is cancelled and every
 *      member is refunded exactly what they put in.
 *
 *      The tradeoff is that this contract custodies funds between payment and
 *      settlement, so the refund path is a first-class feature rather than an
 *      afterthought, and withdrawals stay open even when the contract is paused.
 *
 *      Per-group token: the token is fixed at creation and every share is
 *      denominated in it. Mixing tokens inside one group would make `collected`
 *      meaningless.
 */
contract ArcFlowSplit is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Open accepts joins; Locked is fully subscribed; Settled paid out.
    enum SplitStatus {
        Open,
        Locked,
        Settled,
        Cancelled
    }

    /**
     * @dev Small fields grouped so the hot ones share slots. `memberCount` and
     *      `paidCount` are uint32 (50-member cap makes overflow impossible) and
     *      `createdAt` is uint64 (safe past year 500 billion).
     */
    struct SplitGroup {
        address creator;
        uint32 memberCount;
        uint32 paidCount;
        SplitStatus status;
        bool openJoin;
        address recipient;
        uint64 createdAt;
        address token;
        uint256 committed; // sum of every member's share
        uint256 collected; // sum actually escrowed
        string name;
    }

    struct Member {
        address wallet;
        uint256 share;
        uint256 paidAmount; // escrowed by this member; refundable on cancel
        bool paid;
        uint64 paidAt;
    }

    /// @dev Bounded so `getGroupMembers` and the create loop stay callable.
    uint256 public constant MAX_MEMBERS = 50;

    SplitGroup[] private _groups;
    mapping(uint256 => Member[]) private _members;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => uint256)) private _memberIndex;
    mapping(address => uint256[]) private _userGroups;

    event GroupCreated(
        uint256 indexed groupId,
        address indexed creator,
        address indexed token,
        address recipient,
        string name,
        bool openJoin
    );
    event MemberAdded(uint256 indexed groupId, address indexed member, uint256 share);
    event MemberJoined(uint256 indexed groupId, address indexed member, uint256 share);
    event SharePaid(uint256 indexed groupId, address indexed member, uint256 amount);
    event GroupLocked(uint256 indexed groupId, uint256 committed);
    event GroupSettled(uint256 indexed groupId, address indexed recipient, uint256 amount);
    event GroupCancelled(uint256 indexed groupId);
    event Refunded(uint256 indexed groupId, address indexed member, uint256 amount);

    constructor() Ownable2Step(msg.sender) {}

    // ========================= Create =========================

    /**
     * @notice Create a split group.
     * @param members Optional preset members. May be empty when `openJoin` is
     *                true, which is how "share a link, people join themselves"
     *                works without the creator knowing addresses up front.
     * @param openJoin Whether others may join after creation.
     *
     * @dev The recipient is fixed here and never re-read from caller input, so
     *      no member can redirect the payout at settlement time.
     */
    function createSplit(
        string calldata name,
        address token,
        address recipient,
        address[] calldata members,
        uint256[] calldata shares,
        bool openJoin
    ) external whenNotPaused returns (uint256 groupId) {
        require(bytes(name).length > 0, "Empty name");
        require(bytes(name).length <= 64, "Name too long");
        require(token != address(0), "Zero token");
        require(recipient != address(0), "Zero recipient");
        require(members.length == shares.length, "Length mismatch");
        require(members.length <= MAX_MEMBERS, "Too many members");
        // A closed group with no members could never be settled or cancelled
        // into a meaningful state, so reject it at creation.
        require(openJoin || members.length > 0, "Closed group needs members");

        groupId = _groups.length;

        _groups.push(
            SplitGroup({
                creator: msg.sender,
                memberCount: 0,
                paidCount: 0,
                status: SplitStatus.Open,
                openJoin: openJoin,
                recipient: recipient,
                createdAt: uint64(block.timestamp),
                token: token,
                committed: 0,
                collected: 0,
                name: name
            })
        );

        emit GroupCreated(groupId, msg.sender, token, recipient, name, openJoin);

        uint256 committed;
        for (uint256 i = 0; i < members.length; i++) {
            address member = members[i];
            require(member != address(0), "Zero member");
            require(shares[i] > 0, "Zero share");
            require(!isMember[groupId][member], "Duplicate member");

            committed += shares[i];
            _addMember(groupId, member, shares[i]);
            emit MemberAdded(groupId, member, shares[i]);
        }

        SplitGroup storage g = _groups[groupId];
        g.committed = committed;
        g.memberCount = uint32(members.length);

        // A fully-specified closed group is immediately locked: nobody can join,
        // so its membership is already final.
        if (!openJoin) {
            g.status = SplitStatus.Locked;
            emit GroupLocked(groupId, committed);
        }
    }

    function _addMember(uint256 groupId, address member, uint256 share) private {
        _memberIndex[groupId][member] = _members[groupId].length;
        _members[groupId].push(
            Member({wallet: member, share: share, paidAmount: 0, paid: false, paidAt: 0})
        );
        isMember[groupId][member] = true;
        _userGroups[member].push(groupId);
    }

    // ========================= Join =========================

    /**
     * @notice Join an open split with a self-declared share.
     * @dev Only valid while the group is Open. Joining does not transfer funds;
     *      {payShare} does. Separating them means a member can commit to a share
     *      before having the balance, which is how real bill-splitting works.
     */
    function joinSplit(uint256 groupId, uint256 share) external whenNotPaused {
        SplitGroup storage g = _requireGroup(groupId);
        require(g.openJoin, "Not open to join");
        require(g.status == SplitStatus.Open, "Not accepting members");
        require(!isMember[groupId][msg.sender], "Already a member");
        require(share > 0, "Zero share");
        require(g.memberCount < MAX_MEMBERS, "Group full");

        g.committed += share;
        g.memberCount += 1;
        _addMember(groupId, msg.sender, share);

        emit MemberJoined(groupId, msg.sender, share);
    }

    /**
     * @notice Stop accepting new members.
     * @dev Locking is what makes `committed` final, which settlement depends on.
     *      Restricted to the creator: letting any member lock would let one
     *      person freeze others out of a group they were invited to.
     */
    function lockGroup(uint256 groupId) external {
        SplitGroup storage g = _requireGroup(groupId);
        require(msg.sender == g.creator, "Not creator");
        require(g.status == SplitStatus.Open, "Not open");
        require(g.memberCount > 0, "No members");

        g.status = SplitStatus.Locked;
        emit GroupLocked(groupId, g.committed);
    }

    // ========================= Pay =========================

    /**
     * @notice Escrow the caller's share.
     * @dev Balance is checked against the amount actually received rather than
     *      trusting the requested amount, so fee-on-transfer tokens cannot
     *      credit a member for more than the contract holds — which would leave
     *      settlement permanently short and the group stuck.
     */
    function payShare(uint256 groupId) external whenNotPaused nonReentrant {
        SplitGroup storage g = _requireGroup(groupId);
        require(
            g.status == SplitStatus.Open || g.status == SplitStatus.Locked,
            "Not payable"
        );
        require(isMember[groupId][msg.sender], "Not a member");

        Member storage m = _members[groupId][_memberIndex[groupId][msg.sender]];
        require(!m.paid, "Already paid");

        uint256 share = m.share;
        IERC20 token = IERC20(g.token);

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), share);
        uint256 received = token.balanceOf(address(this)) - before;
        require(received > 0, "No tokens received");

        m.paid = true;
        m.paidAmount = received;
        m.paidAt = uint64(block.timestamp);
        g.paidCount += 1;
        g.collected += received;

        emit SharePaid(groupId, msg.sender, received);
    }

    // ========================= Settle =========================

    /**
     * @notice Release the escrowed total to the recipient.
     * @dev Requires every member to have paid. Callable by the creator or the
     *      recipient — both have a direct interest in completion, and requiring
     *      only the creator would strand funds if they went away.
     */
    function settle(uint256 groupId) external nonReentrant {
        SplitGroup storage g = _requireGroup(groupId);
        require(g.status == SplitStatus.Locked, "Not locked");
        require(g.paidCount == g.memberCount, "Not fully paid");
        require(msg.sender == g.creator || msg.sender == g.recipient, "Not authorized");

        uint256 amount = g.collected;
        require(amount > 0, "Nothing to settle");

        // Effects before the transfer, and `collected` zeroed so a reentrant
        // call finds nothing left to pay out.
        g.status = SplitStatus.Settled;
        g.collected = 0;

        IERC20(g.token).safeTransfer(g.recipient, amount);
        emit GroupSettled(groupId, g.recipient, amount);
    }

    // ========================= Cancel & refund =========================

    /**
     * @notice Cancel before settlement; members reclaim their escrow.
     * @dev Cancelling does not push refunds. Looping transfers over up to 50
     *      members can exceed the block gas limit, and one member on a token
     *      blocklist would revert the whole loop and trap everyone's funds.
     *      Each member pulls their own instead.
     */
    function cancelSplit(uint256 groupId) external {
        SplitGroup storage g = _requireGroup(groupId);
        require(msg.sender == g.creator || msg.sender == owner, "Not authorized");
        require(
            g.status == SplitStatus.Open || g.status == SplitStatus.Locked,
            "Not cancellable"
        );

        g.status = SplitStatus.Cancelled;
        emit GroupCancelled(groupId);
    }

    /**
     * @notice Withdraw your escrow from a cancelled group.
     * @dev Intentionally has no `whenNotPaused`: pausing must never trap funds
     *      that already belong to a user.
     */
    function withdrawRefund(uint256 groupId) external nonReentrant {
        SplitGroup storage g = _requireGroup(groupId);
        require(g.status == SplitStatus.Cancelled, "Not cancelled");
        require(isMember[groupId][msg.sender], "Not a member");

        Member storage m = _members[groupId][_memberIndex[groupId][msg.sender]];
        uint256 amount = m.paidAmount;
        require(amount > 0, "Nothing to refund");

        // Zeroed before the transfer so a reentrant call cannot double-refund.
        m.paidAmount = 0;
        m.paid = false;
        g.collected -= amount;

        IERC20(g.token).safeTransfer(msg.sender, amount);
        emit Refunded(groupId, msg.sender, amount);
    }

    // ========================= Views =========================

    function _requireGroup(uint256 groupId) private view returns (SplitGroup storage) {
        require(groupId < _groups.length, "Invalid group");
        return _groups[groupId];
    }

    function getGroup(uint256 groupId)
        external
        view
        returns (
            address creator,
            address recipient,
            address token,
            string memory name,
            uint256 committed,
            uint256 collected,
            uint32 memberCount,
            uint32 paidCount,
            SplitStatus status,
            bool openJoin,
            uint64 createdAt
        )
    {
        SplitGroup storage g = _requireGroup(groupId);
        return (
            g.creator,
            g.recipient,
            g.token,
            g.name,
            g.committed,
            g.collected,
            g.memberCount,
            g.paidCount,
            g.status,
            g.openJoin,
            g.createdAt
        );
    }

    function getGroupMembers(uint256 groupId)
        external
        view
        returns (
            address[] memory wallets,
            uint256[] memory shares,
            uint256[] memory paidAmounts,
            bool[] memory paid
        )
    {
        Member[] storage list = _members[groupId];
        uint256 len = list.length;
        wallets = new address[](len);
        shares = new uint256[](len);
        paidAmounts = new uint256[](len);
        paid = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            wallets[i] = list[i].wallet;
            shares[i] = list[i].share;
            paidAmounts[i] = list[i].paidAmount;
            paid[i] = list[i].paid;
        }
    }

    function getUserGroups(address user) external view returns (uint256[] memory) {
        return _userGroups[user];
    }

    /// @notice What `user` still owes for a group; 0 if paid or not a member.
    function getOutstandingShare(uint256 groupId, address user) external view returns (uint256) {
        if (groupId >= _groups.length || !isMember[groupId][user]) return 0;
        Member storage m = _members[groupId][_memberIndex[groupId][user]];
        return m.paid ? 0 : m.share;
    }

    /// @notice Refundable escrow for `user` after cancellation.
    function getRefundable(uint256 groupId, address user) external view returns (uint256) {
        if (groupId >= _groups.length || !isMember[groupId][user]) return 0;
        if (_groups[groupId].status != SplitStatus.Cancelled) return 0;
        return _members[groupId][_memberIndex[groupId][user]].paidAmount;
    }

    function getGroupCount() external view returns (uint256) {
        return _groups.length;
    }

    // ========================= Admin =========================

    function setPaused(bool value) external onlyOwner {
        _setPaused(value);
    }
}
