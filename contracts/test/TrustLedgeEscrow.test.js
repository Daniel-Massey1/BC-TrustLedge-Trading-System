const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * TrustLedgeEscrow tests: one key test per main contract function.
 *
 * Each test checks one rule that protects users' money:
 *   1. createListing  - the price is stored on-chain, so the contract (not the buyer) decides what to pay
 *   2. createTrade    - a buyer can't lock a listing by paying 1 wei (the original bug)
 *   3. markShipped    - only the seller can say the item was shipped
 *   4. confirmReceipt - the seller can't be paid twice for one trade
 *   5. withdraw       - a malicious contract can't drain the escrow with a re-entrancy attack
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