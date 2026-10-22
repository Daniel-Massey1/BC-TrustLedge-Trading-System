const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * TrustLedgeEscrow tests.
 *
 * Each test checks one rule that protects users' money:
 *   1. createListing  - the price is stored on-chain, so the contract (not the buyer) decides what to pay
 *   2. createTrade    - a buyer can't lock a listing by paying 1 wei (the original bug)
 *   3. markShipped    - only the seller can say the item was shipped
 *   4. confirmReceipt - the seller can't be paid twice for one trade
 *   5. withdraw       - a malicious contract can't drain the escrow with a re-entrancy attack
 *   6. createListing  - a listing can't be free (price 0)
 *   7. createTrade    - a seller can't buy their own listing
 *   8. cancelListing  - only the seller can cancel, and not while a buyer has paid
 *   9. cancelTrade    - the buyer must wait 7 days, then gets a full refund
 *  10. withdrawTo     - a seller whose wallet rejects ETH can still collect the payment
 *
 * Every test starts from a fresh copy of a local blockchain (loadFixture),
 * so tests never affect each other.
 */

// Status numbers as defined in TrustLedgeEscrow.sol
const ListingStatus = { None: 0, Active: 1, Locked: 2, Sold: 3, Cancelled: 4 };
// Behaviours of the test-only attacker contract (contracts/test/EscrowTestParty.sol)
const PartyMode = { Accept: 0, Reject: 1, Reenter: 2 };

describe("TrustLedgeEscrow", function () {
  const PRICE = ethers.parseEther("0.0005");
  const LISTING_ID = 1n; // the contract numbers listings from 1
  const TRADE_ID = 1n; // and trades from 1
  // Stand-in for the hash of the off-chain listing (title, description, photo...)
  const LISTING_HASH = ethers.keccak256(ethers.toUtf8Bytes("listing-1"));

  // Fresh contract plus three accounts: a buyer, a seller and an outsider
  async function deployFixture() {
    const [buyer, seller, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("TrustLedgeEscrow");
    return { escrow, buyer, seller, other };
  }

  // A trade that is listed, paid for and already shipped (ready for confirmReceipt)
  async function shippedTradeFixture() {
    const ctx = await deployFixture();
    await ctx.escrow.connect(ctx.seller).createListing(PRICE);
    await ctx.escrow.connect(ctx.buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
    await ctx.escrow.connect(ctx.seller).markShipped(TRADE_ID, "NZP-123");
    return ctx;
  }

  /*
   * 1. createListing
   * What:   the seller registers an item and its price.
   * Why:    storing the price on-chain is the base of the 1-wei fix. The contract
   *         knows the real price, so a buyer can't choose how much to pay.
   * Checks: seller and price are saved, the listing is Active, and the
   *         ListingCreated event is emitted so the app can read the new id.
   */
  it("createListing stores the seller and price on-chain", async function () {
    const { escrow, seller } = await loadFixture(deployFixture);

    await expect(escrow.connect(seller).createListing(PRICE))
      .to.emit(escrow, "ListingCreated")
      .withArgs(LISTING_ID, seller.address, PRICE);

    const listing = await escrow.getListing(LISTING_ID);
    expect(listing.seller).to.equal(seller.address);
    expect(listing.price).to.equal(PRICE);
    expect(listing.status).to.equal(ListingStatus.Active);
  });

  /*
   * 2. createTrade
   * What:   an attacker tries to "buy" a listing for 1 wei (almost zero ETH).
   * Attack: in the old contract any payment above 0 was accepted and locked the
   *         listing, so anyone could block every item on the market for a few cents of gas.
   * Checks: the payment is rejected with WrongPayment, and the listing stays
   *         Active so real buyers can still purchase it.
   */
  it("createTrade rejects a 1 wei payment (the listing-lock attack)", async function () {
    const { escrow, seller, other } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);

    await expect(
      escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: 1 })
    ).to.be.revertedWithCustomError(escrow, "WrongPayment");

    expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);
  });

  /*
   * 3. markShipped
   * What:   someone who is not part of the trade tries to mark it as shipped,
   *         then the real seller does.
   * Attack: if anyone could mark a trade shipped, they could stop the buyer from
   *         cancelling and getting a refund (refunds are only allowed before shipping).
   * Checks: the outsider is rejected with NotAuthorised; the seller succeeds and
   *         the tracking reference is recorded in the TradeShipped event.
   */
  it("markShipped can only be called by the seller", async function () {
    const { escrow, buyer, seller, other } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });

    await expect(escrow.connect(other).markShipped(TRADE_ID, "X")).to.be.revertedWithCustomError(
      escrow,
      "NotAuthorised"
    );

    await expect(escrow.connect(seller).markShipped(TRADE_ID, "NZP-123"))
      .to.emit(escrow, "TradeShipped")
      .withArgs(TRADE_ID, "NZP-123");
  });

  /*
   * 4. confirmReceipt
   * What:   the buyer confirms they received the item, then tries to confirm again.
   * Bug:    without a status check, a second confirm could credit the seller twice
   *         and pay out ETH that belongs to other trades in the escrow.
   * Checks: the first confirm credits the seller exactly the price (PaymentCredited);
   *         the second is rejected with WrongStatus; the seller is owed the price only once.
   */
  it("confirmReceipt pays the seller only once (double confirm is rejected)", async function () {
    const { escrow, buyer, seller } = await loadFixture(shippedTradeFixture);

    await expect(escrow.connect(buyer).confirmReceipt(TRADE_ID))
      .to.emit(escrow, "PaymentCredited")
      .withArgs(seller.address, PRICE);

    await expect(escrow.connect(buyer).confirmReceipt(TRADE_ID)).to.be.revertedWithCustomError(
      escrow,
      "WrongStatus"
    );

    expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);
  });

  /*
   * 5. withdraw
   * What:   the seller is a malicious contract (EscrowTestParty). When the escrow
   *         sends it ETH, its receive() function immediately calls withdraw() again.
   * Attack: re-entrancy. If the contract sent ETH before updating the balance,
   *         the attacker could keep re-entering and drain other users' money.
   * Checks: the attacker is paid exactly once; its second, re-entrant call fails
   *         with OpenZeppelin's ReentrancyGuardReentrantCall error, which proves the
   *         nonReentrant guard is what stopped it.
   */
  it("withdraw blocks a re-entrancy attack and pays out only once", async function () {
    const { escrow, buyer } = await loadFixture(deployFixture);

    // Set up a normal sale where the seller is the attacker contract
    const attacker = await ethers.deployContract("EscrowTestParty", [await escrow.getAddress()]);
    await attacker.createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
    await attacker.markShipped(TRADE_ID);
    await escrow.connect(buyer).confirmReceipt(TRADE_ID);

    // Arm the attack: while receiving ETH, call withdraw() again
    await attacker.setMode(PartyMode.Reenter, escrow.interface.encodeFunctionData("withdraw"));

    // Only one payment leaves the escrow
    await expect(attacker.withdraw()).to.changeEtherBalances([escrow, attacker], [-PRICE, PRICE]);

    // The re-entrant call was attempted and blocked by the guard
    expect(await attacker.reentryAttempted()).to.equal(true);
    expect(await attacker.reentrySucceeded()).to.equal(false);
    const selector = escrow.interface.getError("ReentrancyGuardReentrantCall").selector;
    expect(await attacker.reentryRevertData()).to.equal(selector);
  });

  /*
   * 6. createListing (price 0)
   * What:   a seller tries to list an item for 0 ETH.
   * Why:    a free listing could be "bought" for nothing, which would make the
   *         exact-price check from test 2 meaningless.
   * Checks: the call is rejected with InvalidPrice and no listing is created.
   */
  it("createListing rejects a price of 0", async function () {
    const { escrow, seller } = await loadFixture(deployFixture);

    await expect(escrow.connect(seller).createListing(0)).to.be.revertedWithCustomError(
      escrow,
      "InvalidPrice"
    );

    expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.None);
  });

  /*
   * 7. createTrade (seller buys own listing)
   * What:   the seller tries to buy their own listing.
   * Attack: a seller could "buy" their own items and confirm them to inflate the
   *         completed-trades count that is shown as their reputation.
   * Checks: the purchase is rejected with InvalidSeller and the listing stays Active.
   */
  it("createTrade stops a seller buying their own listing", async function () {
    const { escrow, seller } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);

    await expect(
      escrow.connect(seller).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE })
    ).to.be.revertedWithCustomError(escrow, "InvalidSeller");

    expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);
  });

  /*
   * 8. cancelListing
   * What:   an outsider tries to cancel someone else's listing; later the seller
   *         tries to cancel a listing a buyer has already paid for.
   * Attack: anyone could remove other sellers' items from the market, or a seller
   *         could cancel a paid listing and leave the buyer's trade in a broken state.
   * Checks: the outsider gets NotAuthorised; once a buyer has paid, the seller gets
   *         ListingNotActive and the listing stays Locked.
   */
  it("cancelListing is seller-only and blocked once a buyer has paid", async function () {
    const { escrow, buyer, seller, other } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);

    await expect(escrow.connect(other).cancelListing(LISTING_ID)).to.be.revertedWithCustomError(
      escrow,
      "NotAuthorised"
    );

    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });

    await expect(escrow.connect(seller).cancelListing(LISTING_ID)).to.be.revertedWithCustomError(
      escrow,
      "ListingNotActive"
    );
    expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Locked);
  });

  /*
   * 9. cancelTrade (buyer refund after 7 days)
   * What:   the buyer tries to cancel straight after paying, then again after
   *         the 7-day waiting period has passed without shipment.
   * Why:    the buyer must not be able to cancel while the seller is still packing
   *         the item, but must get their money back if the seller never ships.
   * Checks: the early cancel is rejected with NotAuthorised; after 7 days the buyer
   *         is credited the full price and the listing is back on sale (Active).
   */
  it("cancelTrade lets the buyer get a refund only after 7 days", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });

    await expect(escrow.connect(buyer).cancelTrade(TRADE_ID)).to.be.revertedWithCustomError(
      escrow,
      "NotAuthorised"
    );

    // Move the local blockchain's clock forward by the waiting period
    await time.increase(await escrow.BUYER_CANCEL_DELAY());

    await expect(escrow.connect(buyer).cancelTrade(TRADE_ID))
      .to.emit(escrow, "PaymentCredited")
      .withArgs(buyer.address, PRICE);

    expect(await escrow.pendingWithdrawals(buyer.address)).to.equal(PRICE);
    expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);
  });

  /*
   * 10. withdrawTo (seller wallet rejects ETH)
   * What:   the seller is a contract that refuses to receive ETH (EscrowTestParty
   *         in Reject mode). It tries withdraw(), then withdrawTo() another address.
   * Bug:    in the first version the payment was pushed to the seller inside
   *         confirmReceipt, so a seller like this made the trade fail and the
   *         buyer's money stayed stuck in the escrow forever.
   * Checks: the trade still completes; withdraw() fails with TransferFailed but the
   *         balance is kept; withdrawTo() then pays the full price to the other address.
   */
  it("withdrawTo lets a seller that rejects ETH still collect the payment", async function () {
    const { escrow, buyer, other } = await loadFixture(deployFixture);

    // Normal sale where the seller is a contract that rejects ETH
    const seller = await ethers.deployContract("EscrowTestParty", [await escrow.getAddress()]);
    await seller.setMode(PartyMode.Reject, "0x");
    await seller.createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
    await seller.markShipped(TRADE_ID);

    // The buyer can still confirm, because confirmReceipt only credits the seller
    await escrow.connect(buyer).confirmReceipt(TRADE_ID);

    // Sending to the seller fails, but the money is not lost
    await expect(seller.withdraw()).to.be.revertedWithCustomError(escrow, "TransferFailed");
    expect(await escrow.pendingWithdrawals(await seller.getAddress())).to.equal(PRICE);

    // The seller sends its balance to another address instead
    await expect(seller.withdrawTo(other.address)).to.changeEtherBalances(
      [escrow, other],
      [-PRICE, PRICE]
    );
  });
});