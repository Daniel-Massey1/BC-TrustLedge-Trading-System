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
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice Stages of a trade. None (0) means the trade id does not exist.
    enum Status {
        None,
        Funded, // buyer has paid; ETH is held by this contract
        Shipped, // seller says the item is on its way
        Completed, // buyer confirmed receipt; seller has been credited
        Refunded // trade cancelled before shipping; buyer has been credited
    }

    /// @notice Stages of a listing. None (0) means the listing id does not exist.
    enum ListingStatus {
        None,
        Active, // for sale, anyone except the seller can buy it
        Locked, // a buyer has paid; nobody else can buy it
        Sold, // trade completed
        Cancelled // seller removed it from sale
    }

    /// @notice What the contract knows about an item for sale.
    ///         Title, description and photos stay off-chain (in the database).
    struct Listing {
        address payable seller;
        uint256 price; // in wei; createTrade must pay exactly this
        ListingStatus status;
    }

    /// @notice One purchase of one listing.
    struct Trade {
        uint256 listingId;
        address payable buyer;
        address payable seller; // copied from the listing, never supplied by the buyer
        uint256 amount; // wei held in escrow for this trade
        bytes32 listingHash; // keccak256 of the off-chain listing, to detect later edits
        Status status;
        uint64 createdAt; // block timestamp, used for the buyer's cancel delay
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    /// @notice How long a buyer must wait for shipment before they can cancel.
    /// @dev Prototype assumption; would be configurable in production.
    uint256 public constant BUYER_CANCEL_DELAY = 7 days;

    /// @dev Ids start at 1 so that id 0 always means "does not exist".
    uint256 public nextListingId = 1;
    uint256 public nextTradeId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Trade) public trades;
    /// @notice Number of completed trades per account (reputation badge in the app).
    mapping(address => uint256) public completedTrades;
    /// @notice ETH owed to each account, ready to withdraw.
    mapping(address => uint256) public pendingWithdrawals;

    // ------------------------------------------------------------------
    // Events: let the app and Etherscan follow every step of a trade
    // ------------------------------------------------------------------

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
    /// @dev The tracking reference is only logged here, never stored (saves gas).
    event TradeShipped(uint256 indexed tradeId, string trackingRef);
    event TradeCompleted(uint256 indexed tradeId);
    event TradeRefunded(uint256 indexed tradeId, address cancelledBy);
    event PaymentCredited(address indexed payee, uint256 amount);
    event Withdrawn(address indexed payee, address to, uint256 amount);

    // ------------------------------------------------------------------
    // Errors: custom errors are cheaper than revert strings
    // ------------------------------------------------------------------

    error ListingNotActive(); // listing missing, already in a trade, sold or cancelled
    error InvalidPrice(); // price of 0
    error WrongPayment(); // msg.value is not exactly the listing price
    error InvalidSeller(); // seller tried to buy their own listing
    error WrongStatus(); // action not allowed at the trade's current stage
    error NotAuthorised(); // caller is not the right buyer or seller
    error TransferFailed(); // recipient rejected the ETH
    error NothingToWithdraw(); // caller has no balance

    // ------------------------------------------------------------------
    // Listings
    // ------------------------------------------------------------------

    /// @notice Seller registers a listing and its price. The id is assigned
    ///         here so nobody can claim another seller's listing id first.
    function createListing(uint256 price) external returns (uint256 listingId) {
        // Check
        if (price == 0) revert InvalidPrice();

        // Effect: save seller and price; the next id is reserved for the next listing
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
        // Checks: only an Active listing, only by its own seller
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        if (msg.sender != l.seller) revert NotAuthorised();

        l.status = ListingStatus.Cancelled;
        emit ListingCancelled(listingId);
    }

    // ------------------------------------------------------------------
    // Trades
    // ------------------------------------------------------------------

    /// @notice Buyer locks exactly the registered listing price in escrow.
    function createTrade(uint256 listingId, bytes32 listingHash)
        external
        payable
        returns (uint256 tradeId)
    {
        Listing storage l = listings[listingId];
        // Checks
        if (l.status != ListingStatus.Active) revert ListingNotActive();
        // Exact price only: this closes the old "lock a listing for 1 wei" attack
        if (msg.value != l.price) revert WrongPayment();
        if (msg.sender == l.seller) revert InvalidSeller();

        // Effects: record the trade (the ETH stays in this contract) and lock the listing
        tradeId = nextTradeId++;
        trades[tradeId] = Trade({
            listingId: listingId,
            buyer: payable(msg.sender),
            seller: l.seller, // from storage, so the buyer can't redirect payment
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
        // Checks: trade must be paid and not yet shipped; only its seller may call
        if (t.status != Status.Funded) revert WrongStatus();
        if (msg.sender != t.seller) revert NotAuthorised();

        // After this the trade can no longer be cancelled
        t.status = Status.Shipped;
        emit TradeShipped(tradeId, trackingRef);
    }

    /// @notice Buyer confirms receipt; the price is credited to the seller.
    function confirmReceipt(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        // Checks: only a Shipped trade, so a second confirm fails with WrongStatus
        if (t.status != Status.Shipped) revert WrongStatus();
        if (msg.sender != t.buyer) revert NotAuthorised();

        // Effects: close the trade, mark the item sold, update both reputations
        t.status = Status.Completed;
        listings[t.listingId].status = ListingStatus.Sold;
        completedTrades[t.buyer] += 1;
        completedTrades[t.seller] += 1;
        emit TradeCompleted(tradeId);

        // Pull payment: the seller collects the ETH later with withdraw()
        _credit(t.seller, t.amount);
    }

    /// @notice Seller may cancel any time before shipping; buyer only after BUYER_CANCEL_DELAY.
    ///         The listing becomes active again so another buyer can purchase it.
    function cancelTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        // Checks: only before shipping
        if (t.status != Status.Funded) revert WrongStatus();

        // The buyer must wait, so they can't cancel while the seller is packing the item
        bool sellerCancel = msg.sender == t.seller;
        bool buyerCancel = msg.sender == t.buyer &&
            block.timestamp >= t.createdAt + BUYER_CANCEL_DELAY;
        if (!sellerCancel && !buyerCancel) revert NotAuthorised();

        // Effects: close the trade and put the listing back on sale
        t.status = Status.Refunded;
        listings[t.listingId].status = ListingStatus.Active;
        emit TradeRefunded(tradeId, msg.sender);

        // Pull payment: the buyer collects the refund later with withdraw()
        _credit(t.buyer, t.amount);
    }

    // ------------------------------------------------------------------
    // Withdrawals (pull payments)
    // ------------------------------------------------------------------

    /// @notice Sends the caller everything they are owed.
    /// @dev nonReentrant: a contract receiving the ETH can't call back into withdraw.
    function withdraw() external nonReentrant {
        _withdraw(payable(msg.sender));
    }

    /// @notice Same as withdraw(), but pays another address. Lets an account
    ///         that cannot receive ETH (e.g. a contract) still get its money out.
    function withdrawTo(address payable to) external nonReentrant {
        _withdraw(to);
    }

    /// @dev Records money owed to `payee` without sending anything. Because no ETH
    ///      is sent here, a payee that rejects ETH can't block confirm or cancel.
    function _credit(address payee, uint256 amount) private {
        pendingWithdrawals[payee] += amount;
        emit PaymentCredited(payee, amount);
    }

    /// @dev The only place in the contract that sends ETH.
    function _withdraw(address payable to) private {
        // Check
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // Effect: zero the balance before sending (checks-effects-interactions),
        // so even a re-entrant call would find nothing left to withdraw
        pendingWithdrawals[msg.sender] = 0;
        emit Withdrawn(msg.sender, to, amount);

        // Interaction: send the ETH. If it fails the whole call reverts and the
        // balance is restored, so it can be withdrawn later (e.g. with withdrawTo)
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ------------------------------------------------------------------
    // Views (free to call, no transaction)
    // ------------------------------------------------------------------

    /// @notice Number of completed trades for an account (0 = "New seller").
    function hasTraded(address account) external view returns (uint256) {
        return completedTrades[account];
    }

    /// @notice Seller, price and status of a listing, as one struct.
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    /// @notice All stored details of a trade, as one struct.
    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }
}