// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice TEST ONLY. NEVER DEPLOY. A copy of TrustLedgeEscrow with five
///         deliberate bugs, each marked "BUG". test-bugs/BuggyEscrow.test.js
///         runs the real security rules against it to show that the tests
///         catch these mistakes (every test in that file is expected to fail).
contract BuggyEscrow {
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

    uint256 public constant BUYER_CANCEL_DELAY = 7 days;

    uint256 public nextListingId = 1;
    uint256 public nextTradeId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Trade) public trades;
    mapping(address => uint256) public completedTrades;
    mapping(address => uint256) public pendingWithdrawals;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price);
    event TradeShipped(uint256 indexed tradeId, string trackingRef);
    event PaymentCredited(address indexed payee, uint256 amount);

    error ListingNotActive();
    error InvalidPrice();
    error WrongPayment();
    error InvalidSeller();
    error WrongStatus();
    error NotAuthorised();
    error TransferFailed();
    error NothingToWithdraw();

    function createListing(uint256 price) external returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        listingId = nextListingId++;
        listings[listingId] = Listing(payable(msg.sender), price, ListingStatus.Active);
        emit ListingCreated(listingId, msg.sender, price);
    }

    function createTrade(uint256 listingId, bytes32 listingHash)
        external
        payable
        returns (uint256 tradeId)
    {
        Listing storage l = listings[listingId];
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        // BUG 1: any payment above 0 is accepted, not the exact listing price
        if (msg.value == 0) revert WrongPayment();
        if (msg.sender == l.seller) revert InvalidSeller();

        tradeId = nextTradeId++;
        trades[tradeId] = Trade(
            listingId,
            payable(msg.sender),
            l.seller,
            msg.value,
            listingHash,
            Status.Funded,
            uint64(block.timestamp)
        );
        l.status = ListingStatus.Locked;
    }

    function markShipped(uint256 tradeId, string calldata trackingRef) external {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Funded) revert WrongStatus();
        // BUG 2: no check that the caller is the seller

        t.status = Status.Shipped;
        emit TradeShipped(tradeId, trackingRef);
    }

    function confirmReceipt(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        // BUG 3: only rejects Funded trades, so a Completed trade can be confirmed again
        if (t.status == Status.Funded) revert WrongStatus();
        if (msg.sender != t.buyer) revert NotAuthorised();

        t.status = Status.Completed;
        listings[t.listingId].status = ListingStatus.Sold;
        completedTrades[t.buyer] += 1;
        completedTrades[t.seller] += 1;
        _credit(t.seller, t.amount);
    }

    function cancelTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Funded) revert WrongStatus();

        bool sellerCancel = msg.sender == t.seller;
        // BUG 4: the buyer can cancel at once, without waiting BUYER_CANCEL_DELAY
        bool buyerCancel = msg.sender == t.buyer;
        if (!sellerCancel && !buyerCancel) revert NotAuthorised();

        t.status = Status.Refunded;
        listings[t.listingId].status = ListingStatus.Active;
        _credit(t.buyer, t.amount);
    }

    // BUG 5a: no nonReentrant guard
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // BUG 5b: ETH is sent BEFORE the balance is set to 0
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        pendingWithdrawals[msg.sender] = 0;
    }

    function _credit(address payee, uint256 amount) private {
        pendingWithdrawals[payee] += amount;
        emit PaymentCredited(payee, amount);
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }
}