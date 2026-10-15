// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TrustLedgeEscrow
/// @notice One shared escrow contract for every TrustLedge trade.
///         Sellers register each listing and its price on-chain, so the
///         contract (not the buyer) decides how much a trade must lock.
///         Listing: Active -> Locked -> Sold, or Locked -> Active (refund), or Active -> Cancelled.
///         Trade:   Funded -> Shipped -> Completed, or Funded -> Refunded.
///         Payouts use the pull-payment pattern: completing or refunding a
///         trade only credits pendingWithdrawals, and the payee calls
///         withdraw() to receive the ETH.
contract TrustLedgeEscrow is ReentrancyGuard {
    enum Status {
        None,
        Funded,
        Shipped,
        Completed,
        Refunded
    }

    enum ListingStatus {
        None,
        Active,
        Locked,
        Sold,
        Cancelled
    }

    struct Listing {
        address payable seller;
        uint256 price;
        ListingStatus status;
    }

    struct Trade {
        uint256 listingId;
        address payable buyer;
        address payable seller;
        uint256 amount;
        bytes32 listingHash;
        Status status;
        uint64 createdAt;
    }

    /// @dev Prototype assumption; would be configurable in production.
    uint256 public constant BUYER_CANCEL_DELAY = 7 days;

    uint256 public nextListingId = 1;
    uint256 public nextTradeId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Trade) public trades;
    mapping(address => uint256) public completedTrades;
    /// @notice ETH owed to each account, ready to withdraw.
    mapping(address => uint256) public pendingWithdrawals;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed listingId);
    event TradeCreated(
        uint256 indexed tradeId,
        uint256 indexed listingId,
        address indexed buyer,
        address seller,
        uint256 amount,
        bytes32 listingHash
    );
    event TradeShipped(uint256 indexed tradeId, string trackingRef);
    event TradeCompleted(uint256 indexed tradeId);
    event TradeRefunded(uint256 indexed tradeId, address cancelledBy);
    event PaymentCredited(address indexed payee, uint256 amount);
    event Withdrawn(address indexed payee, address to, uint256 amount);

    error ListingNotActive();
    error InvalidPrice();
    error WrongPayment();
    error InvalidSeller();
    error WrongStatus();
    error NotAuthorised();
    error TransferFailed();
    error NothingToWithdraw();

    /// @notice Seller registers a listing and its price. The id is assigned
    ///         here so nobody can claim another seller's listing id first.
    function createListing(uint256 price) external returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: payable(msg.sender),
            price: price,
            status: ListingStatus.Active
        });

        emit ListingCreated(listingId, msg.sender, price);
    }

    /// @notice Seller withdraws a listing that is not currently in a trade.
    function cancelListing(uint256 listingId) external {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (msg.sender != l.seller) revert NotAuthorised();

        l.status = ListingStatus.Cancelled;
        emit ListingCancelled(listingId);
    }

    /// @notice Buyer locks exactly the registered listing price in escrow.
    function createTrade(uint256 listingId, bytes32 listingHash)
        external
        payable
        returns (uint256 tradeId)
    {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (msg.value != l.price) revert WrongPayment();
        if (msg.sender == l.seller) revert InvalidSeller();

        tradeId = nextTradeId++;
        trades[tradeId] = Trade({
            listingId: listingId,
            buyer: payable(msg.sender),
            seller: l.seller,
            amount: msg.value,
            listingHash: listingHash,
            status: Status.Funded,
            createdAt: uint64(block.timestamp)
        });
        l.status = ListingStatus.Locked;

        emit TradeCreated(tradeId, listingId, msg.sender, l.seller, msg.value, listingHash);
    }

    /// @notice Seller marks the item as shipped. Tracking ref is only emitted, not stored.
    function markShipped(uint256 tradeId, string calldata trackingRef) external {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Funded) revert WrongStatus();
        if (msg.sender != t.seller) revert NotAuthorised();

        t.status = Status.Shipped;
        emit TradeShipped(tradeId, trackingRef);
    }

    /// @notice Buyer confirms receipt; the price is credited to the seller.
    function confirmReceipt(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Shipped) revert WrongStatus();
        if (msg.sender != t.buyer) revert NotAuthorised();

        t.status = Status.Completed;
        listings[t.listingId].status = ListingStatus.Sold;
        completedTrades[t.buyer] += 1;
        completedTrades[t.seller] += 1;
        emit TradeCompleted(tradeId);

        _credit(t.seller, t.amount);
    }

    /// @notice Seller may cancel any time before shipping; buyer only after BUYER_CANCEL_DELAY.
    ///         The listing becomes active again so another buyer can purchase it.
    function cancelTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Funded) revert WrongStatus();

        bool sellerCancel = msg.sender == t.seller;
        bool buyerCancel = msg.sender == t.buyer &&
            block.timestamp >= t.createdAt + BUYER_CANCEL_DELAY;
        if (!sellerCancel && !buyerCancel) revert NotAuthorised();

        t.status = Status.Refunded;
        listings[t.listingId].status = ListingStatus.Active;
        emit TradeRefunded(tradeId, msg.sender);

        _credit(t.buyer, t.amount);
    }

    /// @notice Sends the caller everything they are owed.
    function withdraw() external nonReentrant {
        _withdraw(payable(msg.sender));
    }

    /// @notice Same as withdraw(), but pays another address. Lets an account
    ///         that cannot receive ETH (e.g. a contract) still get its money out.
    function withdrawTo(address payable to) external nonReentrant {
        _withdraw(to);
    }

    function _credit(address payee, uint256 amount) private {
        pendingWithdrawals[payee] += amount;
        emit PaymentCredited(payee, amount);
    }

    function _withdraw(address payable to) private {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // Zero the balance before sending (checks-effects-interactions)
        pendingWithdrawals[msg.sender] = 0;
        emit Withdrawn(msg.sender, to, amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Number of completed trades for an account (0 = "New seller").
    function hasTraded(address account) external view returns (uint256) {
        return completedTrades[account];
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }
}
