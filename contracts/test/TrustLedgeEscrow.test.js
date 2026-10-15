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

  // Tests 2-5 go here, ABOVE the closing line below

});