const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * Bug demo: EVERY TEST IN THIS FILE IS EXPECTED TO FAIL.
 *
 * Run with: npm run test:bugs
 * (`npx hardhat test` only runs the test/ folder, so the real suite stays green.)
 *
 * The tests check the same security rules as test/TrustLedgeEscrow.test.js,
 * but run them against BuggyEscrow (contracts/test/BuggyEscrow.sol), a copy of
 * the contract with five deliberate bugs. Each failure shows the bug that the
 * real test would catch if someone introduced it into TrustLedgeEscrow:
 *   1. createTrade    accepts any payment above 0      -> 1-wei lock attack works
 *   2. markShipped    has no seller check              -> an outsider can mark a trade shipped
 *   3. confirmReceipt doesn't block Completed trades   -> the seller is paid twice
 *   4. cancelTrade    has no 7-day wait for the buyer  -> the buyer can cancel at once
 *   5. withdraw       sends before zeroing, no guard   -> re-entrancy drains other users' ETH
 */

const ListingStatus = { None: 0, Active: 1, Locked: 2, Sold: 3, Cancelled: 4 };
const PartyMode = { Accept: 0, Reject: 1, Reenter: 2 };

describe("BuggyEscrow (expected to fail)", function () {
  const PRICE = ethers.parseEther("0.0005");
  const LISTING_ID = 1n;
  const TRADE_ID = 1n;
  const LISTING_HASH = ethers.keccak256(ethers.toUtf8Bytes("listing-1"));

  async function deployFixture() {
    const [buyer, seller, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("BuggyEscrow");
    return { escrow, buyer, seller, other };
  }

  async function shippedTradeFixture() {
    const ctx = await deployFixture();
    await ctx.escrow.connect(ctx.seller).createListing(PRICE);
    await ctx.escrow.connect(ctx.buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
    await ctx.escrow.connect(ctx.seller).markShipped(TRADE_ID, "NZP-123");
    return ctx;
  }

  /*
   * BUG 1: createTrade only checks msg.value > 0.
   * Why it fails: the 1 wei payment is accepted, so the call does NOT revert
   * with WrongPayment, and the listing is Locked for 1 wei.
   */
  it("BUG 1 - createTrade accepts 1 wei and locks the listing", async function () {
    const { escrow, seller, other } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);

    await expect(
      escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: 1 })
    ).to.be.revertedWithCustomError(escrow, "WrongPayment");
  });

  /*
   * BUG 2: markShipped doesn't check who is calling.
   * Why it fails: the outsider's call succeeds instead of reverting with
   * NotAuthorised. The trade is now Shipped, so the buyer can no longer cancel.
   */
  it("BUG 2 - an outsider can mark someone else's trade as shipped", async function () {
    const { escrow, buyer, seller, other } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });

    await expect(escrow.connect(other).markShipped(TRADE_ID, "X")).to.be.revertedWithCustomError(
      escrow,
      "NotAuthorised"
    );
  });

  /*
   * BUG 3: confirmReceipt only rejects Funded trades.
   * Why it fails: the second confirm on a Completed trade succeeds instead of
   * reverting with WrongStatus, so the seller is credited the price twice.
   */
  it("BUG 3 - confirming twice pays the seller twice", async function () {
    const { escrow, buyer } = await loadFixture(shippedTradeFixture);
    await escrow.connect(buyer).confirmReceipt(TRADE_ID);

    await expect(escrow.connect(buyer).confirmReceipt(TRADE_ID)).to.be.revertedWithCustomError(
      escrow,
      "WrongStatus"
    );
  });

  /*
   * BUG 4: cancelTrade lets the buyer cancel without waiting 7 days.
   * Why it fails: the immediate cancel succeeds instead of reverting with
   * NotAuthorised, so a buyer can back out while the seller is packing the item.
   */
  it("BUG 4 - the buyer can cancel straight after paying", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    await escrow.connect(seller).createListing(PRICE);
    await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });

    await expect(escrow.connect(buyer).cancelTrade(TRADE_ID)).to.be.revertedWithCustomError(
      escrow,
      "NotAuthorised"
    );
  });

  /*
   * BUG 5: withdraw sends ETH before zeroing the balance and has no nonReentrant.
   * Why it fails: the attacker re-enters withdraw while receiving ETH and is paid
   * TWICE. The escrow loses 2 x PRICE instead of PRICE; the extra ETH belongs to
   * another user whose trade is still in escrow.
   */
  it("BUG 5 - a re-entrancy attack withdraws twice", async function () {
    const { escrow, buyer, other } = await loadFixture(deployFixture);

    // Another user's trade, so the escrow holds ETH that isn't the attacker's
    await escrow.connect(other).createListing(PRICE); // listing 1
    await escrow.connect(buyer).createTrade(1n, LISTING_HASH, { value: PRICE }); // trade 1

    // A normal sale where the seller is the attacker contract
    const attacker = await ethers.deployContract("EscrowTestParty", [await escrow.getAddress()]);
    await attacker.createListing(PRICE); // listing 2
    await escrow.connect(buyer).createTrade(2n, LISTING_HASH, { value: PRICE }); // trade 2
    await attacker.markShipped(2n);
    await escrow.connect(buyer).confirmReceipt(2n);

    await attacker.setMode(PartyMode.Reenter, escrow.interface.encodeFunctionData("withdraw"));

    // The real contract pays out once; this buggy one pays out twice
    await expect(attacker.withdraw()).to.changeEtherBalances([escrow, attacker], [-PRICE, PRICE]);
  });
});
