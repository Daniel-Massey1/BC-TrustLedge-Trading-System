const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Status enums as numbers (must match TrustLedgeEscrow.sol)
const TradeStatus = { None: 0, Funded: 1, Shipped: 2, Completed: 3, Refunded: 4 };
const ListingStatus = { None: 0, Active: 1, Locked: 2, Sold: 3, Cancelled: 4 };
const PartyMode = { Accept: 0, Reject: 1, Reenter: 2 };

describe("TrustLedgeEscrow", function () {
  const PRICE = ethers.parseEther("0.0005");
  const LISTING_ID = 1n;
  const TRADE_ID = 1n;
  const LISTING_HASH = ethers.keccak256(ethers.toUtf8Bytes("listing-1"));
  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  async function deployFixture() {
    const [buyer, seller, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("TrustLedgeEscrow");
    return { escrow, buyer, seller, other };
  }

  async function listedFixture() {
    const ctx = await deployFixture();
    await ctx.escrow.connect(ctx.seller).createListing(PRICE);
    return ctx;
  }

  async function fundedTradeFixture() {
    const ctx = await listedFixture();
    await ctx.escrow.connect(ctx.buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
    return { ...ctx, tradeId: TRADE_ID };
  }

  async function shippedTradeFixture() {
    const ctx = await fundedTradeFixture();
    await ctx.escrow.connect(ctx.seller).markShipped(ctx.tradeId, "NZP-123");
    return ctx;
  }

  // Deploys a contract account (EscrowTestParty) to act as buyer or seller.
  async function deployParty(escrow) {
    return ethers.deployContract("EscrowTestParty", [await escrow.getAddress()]);
  }

  describe("createListing", function () {
    it("registers the seller and price on-chain and emits ListingCreated", async function () {
      const { escrow, seller } = await loadFixture(deployFixture);

      await expect(escrow.connect(seller).createListing(PRICE))
        .to.emit(escrow, "ListingCreated")
        .withArgs(LISTING_ID, seller.address, PRICE);

      const listing = await escrow.getListing(LISTING_ID);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(PRICE);
      expect(listing.status).to.equal(ListingStatus.Active);
      expect(await escrow.nextListingId()).to.equal(2n);
    });

    it("rejects a zero price", async function () {
      const { escrow, seller } = await loadFixture(deployFixture);
      await expect(escrow.connect(seller).createListing(0)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPrice"
      );
    });

    it("has no upper price limit (the sell form only warns about high prices)", async function () {
      const { escrow, seller } = await loadFixture(deployFixture);
      const highPrice = ethers.parseEther("5");
      await expect(escrow.connect(seller).createListing(highPrice))
        .to.emit(escrow, "ListingCreated")
        .withArgs(LISTING_ID, seller.address, highPrice);
    });
  });

  describe("cancelListing", function () {
    it("lets the seller withdraw an active listing and emits ListingCancelled", async function () {
      const { escrow, seller } = await loadFixture(listedFixture);

      await expect(escrow.connect(seller).cancelListing(LISTING_ID))
        .to.emit(escrow, "ListingCancelled")
        .withArgs(LISTING_ID);
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Cancelled);
    });

    it("blocks anyone other than the seller", async function () {
      const { escrow, other } = await loadFixture(listedFixture);
      await expect(escrow.connect(other).cancelListing(LISTING_ID)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("blocks cancelling a listing that is locked in a trade", async function () {
      const { escrow, seller } = await loadFixture(fundedTradeFixture);
      await expect(escrow.connect(seller).cancelListing(LISTING_ID)).to.be.revertedWithCustomError(
        escrow,
        "ListingNotActive"
      );
    });

    it("blocks buying a cancelled listing", async function () {
      const { escrow, buyer, seller } = await loadFixture(listedFixture);
      await escrow.connect(seller).cancelListing(LISTING_ID);
      await expect(
        escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });
  });

  describe("createTrade", function () {
    it("locks the payment in the contract and the listing, and emits TradeCreated", async function () {
      const { escrow, buyer, seller } = await loadFixture(listedFixture);

      const tx = escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
      await expect(tx).to.changeEtherBalances([buyer, escrow], [-PRICE, PRICE]);
      await expect(tx)
        .to.emit(escrow, "TradeCreated")
        .withArgs(TRADE_ID, LISTING_ID, buyer.address, seller.address, PRICE, LISTING_HASH);

      const trade = await escrow.getTrade(TRADE_ID);
      expect(trade.status).to.equal(TradeStatus.Funded);
      expect(trade.seller).to.equal(seller.address);
      expect(trade.amount).to.equal(PRICE);
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Locked);
    });

    it("rejects a 1 wei payment (the old listing-lock attack)", async function () {
      const { escrow, other } = await loadFixture(listedFixture);
      await expect(
        escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: 1 })
      ).to.be.revertedWithCustomError(escrow, "WrongPayment");
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);
    });

    it("rejects overpayment", async function () {
      const { escrow, buyer } = await loadFixture(listedFixture);
      await expect(
        escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE + 1n })
      ).to.be.revertedWithCustomError(escrow, "WrongPayment");
    });

    it("rejects a listing id that was never registered", async function () {
      const { escrow, buyer } = await loadFixture(listedFixture);
      await expect(
        escrow.connect(buyer).createTrade(99, LISTING_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });

    it("stops the seller buying their own listing", async function () {
      const { escrow, seller } = await loadFixture(listedFixture);
      await expect(
        escrow.connect(seller).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "InvalidSeller");
    });

    it("prevents the same listing being bought twice", async function () {
      const { escrow, other } = await loadFixture(fundedTradeFixture);
      await expect(
        escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });
  });

  describe("full trade lifecycle", function () {
    it("ships, confirms and pays the seller", async function () {
      const { escrow, buyer, seller, tradeId } = await loadFixture(fundedTradeFixture);

      await expect(escrow.connect(seller).markShipped(tradeId, "NZP-123"))
        .to.emit(escrow, "TradeShipped")
        .withArgs(tradeId, "NZP-123");

      // Confirming only credits the seller; no ETH leaves the escrow yet
      const tx = escrow.connect(buyer).confirmReceipt(tradeId);
      await expect(tx).to.changeEtherBalances([escrow, seller], [0, 0]);
      await expect(tx).to.emit(escrow, "TradeCompleted").withArgs(tradeId);
      await expect(tx).to.emit(escrow, "PaymentCredited").withArgs(seller.address, PRICE);
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);

      // The seller pulls the payment
      const w = escrow.connect(seller).withdraw();
      await expect(w).to.changeEtherBalances([escrow, seller], [-PRICE, PRICE]);
      await expect(w).to.emit(escrow, "Withdrawn").withArgs(seller.address, seller.address, PRICE);
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(0);

      expect((await escrow.getTrade(tradeId)).status).to.equal(TradeStatus.Completed);
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Sold);
      expect(await escrow.hasTraded(buyer.address)).to.equal(1);
      expect(await escrow.hasTraded(seller.address)).to.equal(1);
    });

    it("rejects confirmReceipt before shipping", async function () {
      const { escrow, buyer, tradeId } = await loadFixture(fundedTradeFixture);
      await expect(escrow.connect(buyer).confirmReceipt(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });

    it("rejects marking a trade as shipped twice", async function () {
      const { escrow, seller, tradeId } = await loadFixture(shippedTradeFixture);
      await expect(escrow.connect(seller).markShipped(tradeId, "X")).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });

    it("rejects a double confirm, so the seller is only paid once", async function () {
      const { escrow, buyer, seller, tradeId } = await loadFixture(shippedTradeFixture);
      await escrow.connect(buyer).confirmReceipt(tradeId);

      await expect(escrow.connect(buyer).confirmReceipt(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
      expect(await escrow.hasTraded(buyer.address)).to.equal(1);
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);
    });

    it("does not let a sold listing be bought again", async function () {
      const { escrow, buyer, other, tradeId } = await loadFixture(shippedTradeFixture);
      await escrow.connect(buyer).confirmReceipt(tradeId);
      await expect(
        escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });

    it("rejects actions on a trade id that does not exist", async function () {
      const { escrow, buyer, seller } = await loadFixture(fundedTradeFixture);
      await expect(escrow.connect(seller).markShipped(99, "X")).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
      await expect(escrow.connect(buyer).confirmReceipt(99)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
      await expect(escrow.connect(seller).cancelTrade(99)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });
  });

  describe("cancelTrade", function () {
    it("lets the seller cancel, credits the buyer's refund and emits TradeRefunded", async function () {
      const { escrow, buyer, seller, tradeId } = await loadFixture(fundedTradeFixture);

      const tx = escrow.connect(seller).cancelTrade(tradeId);
      await expect(tx).to.emit(escrow, "TradeRefunded").withArgs(tradeId, seller.address);
      await expect(tx).to.emit(escrow, "PaymentCredited").withArgs(buyer.address, PRICE);
      await expect(escrow.connect(buyer).withdraw()).to.changeEtherBalances(
        [escrow, buyer],
        [-PRICE, PRICE]
      );

      expect((await escrow.getTrade(tradeId)).status).to.equal(TradeStatus.Refunded);
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);
    });

    it("re-opens the listing so another buyer can purchase it", async function () {
      const { escrow, seller, other, tradeId } = await loadFixture(fundedTradeFixture);
      await escrow.connect(seller).cancelTrade(tradeId);

      await expect(escrow.connect(other).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE }))
        .to.emit(escrow, "TradeCreated")
        .withArgs(2n, LISTING_ID, other.address, seller.address, PRICE, LISTING_HASH);
    });

    it("blocks the buyer from cancelling before 7 days", async function () {
      const { escrow, buyer, tradeId } = await loadFixture(fundedTradeFixture);
      await time.increase(SEVEN_DAYS - 10);
      await expect(escrow.connect(buyer).cancelTrade(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("lets the buyer cancel after 7 days without shipment", async function () {
      const { escrow, buyer, tradeId } = await loadFixture(fundedTradeFixture);
      await time.increase(SEVEN_DAYS);

      await expect(escrow.connect(buyer).cancelTrade(tradeId))
        .to.emit(escrow, "TradeRefunded")
        .withArgs(tradeId, buyer.address);
      expect(await escrow.pendingWithdrawals(buyer.address)).to.equal(PRICE);
    });

    it("blocks the seller cancelling after shipping", async function () {
      const { escrow, seller, tradeId } = await loadFixture(shippedTradeFixture);
      await expect(escrow.connect(seller).cancelTrade(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });

    it("blocks the buyer cancelling after shipping, even after 7 days", async function () {
      const { escrow, buyer, tradeId } = await loadFixture(shippedTradeFixture);
      await time.increase(SEVEN_DAYS);
      await expect(escrow.connect(buyer).cancelTrade(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });

    it("rejects cancelling a trade twice", async function () {
      const { escrow, seller, tradeId } = await loadFixture(fundedTradeFixture);
      await escrow.connect(seller).cancelTrade(tradeId);
      await expect(escrow.connect(seller).cancelTrade(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus"
      );
    });
  });

  describe("someone outside the trade", function () {
    it("cannot mark it shipped", async function () {
      const { escrow, other, tradeId } = await loadFixture(fundedTradeFixture);
      await expect(escrow.connect(other).markShipped(tradeId, "X")).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("cannot confirm receipt", async function () {
      const { escrow, other, tradeId } = await loadFixture(shippedTradeFixture);
      await expect(escrow.connect(other).confirmReceipt(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("cannot cancel it, even after 7 days", async function () {
      const { escrow, other, tradeId } = await loadFixture(fundedTradeFixture);
      await time.increase(SEVEN_DAYS);
      await expect(escrow.connect(other).cancelTrade(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("the seller cannot confirm receipt on the buyer's behalf", async function () {
      const { escrow, seller, tradeId } = await loadFixture(shippedTradeFixture);
      await expect(escrow.connect(seller).confirmReceipt(tradeId)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });

    it("the buyer cannot mark their own trade as shipped", async function () {
      const { escrow, buyer, tradeId } = await loadFixture(fundedTradeFixture);
      await expect(escrow.connect(buyer).markShipped(tradeId, "X")).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorised"
      );
    });
  });

  describe("withdraw", function () {
    async function completedTradeFixture() {
      const ctx = await shippedTradeFixture();
      await ctx.escrow.connect(ctx.buyer).confirmReceipt(ctx.tradeId);
      return ctx;
    }

    it("reverts when there is nothing to withdraw", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(other).withdraw()).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw"
      );
    });

    it("cannot be withdrawn twice", async function () {
      const { escrow, seller } = await loadFixture(completedTradeFixture);
      await escrow.connect(seller).withdraw();
      await expect(escrow.connect(seller).withdraw()).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw"
      );
    });

    it("only pays out the caller's own balance", async function () {
      const { escrow, seller, other } = await loadFixture(completedTradeFixture);
      await expect(escrow.connect(other).withdraw()).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw"
      );
      await expect(escrow.connect(other).withdrawTo(other.address)).to.be.revertedWithCustomError(
        escrow,
        "NothingToWithdraw"
      );
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);
    });

    it("withdrawTo sends the caller's balance to another address", async function () {
      const { escrow, seller, other } = await loadFixture(completedTradeFixture);
      const tx = escrow.connect(seller).withdrawTo(other.address);
      await expect(tx).to.changeEtherBalances([escrow, seller, other], [-PRICE, 0, PRICE]);
      await expect(tx).to.emit(escrow, "Withdrawn").withArgs(seller.address, other.address, PRICE);
    });

    it("adds up payments from several trades", async function () {
      const { escrow, buyer, seller, other } = await loadFixture(deployFixture);
      await escrow.connect(seller).createListing(PRICE);
      await escrow.connect(seller).createListing(PRICE);
      await escrow.connect(buyer).createTrade(1, LISTING_HASH, { value: PRICE });
      await escrow.connect(other).createTrade(2, LISTING_HASH, { value: PRICE });
      for (const [tradeId, b] of [[1, buyer], [2, other]]) {
        await escrow.connect(seller).markShipped(tradeId, "X");
        await escrow.connect(b).confirmReceipt(tradeId);
      }

      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE * 2n);
      await expect(escrow.connect(seller).withdraw()).to.changeEtherBalance(seller, PRICE * 2n);
    });
  });

  describe("re-entrancy", function () {
    // The attacker records why its re-entrant call failed; we expect the
    // ReentrancyGuard error, proving the guard (not a later check) stopped it.
    async function expectGuardBlocked(escrow, attacker) {
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      const selector = escrow.interface.getError("ReentrancyGuardReentrantCall").selector;
      expect(await attacker.reentryRevertData()).to.equal(selector);
    }

    it("blocks a malicious buyer re-entering withdraw during its refund", async function () {
      const { escrow, seller, other } = await loadFixture(deployFixture);
      const attacker = await deployParty(escrow);

      // An honest trade keeps other funds in the escrow for the attacker to target
      await escrow.connect(seller).createListing(PRICE); // listing 1
      await escrow.connect(seller).createListing(PRICE); // listing 2
      await escrow.connect(other).createTrade(1, LISTING_HASH, { value: PRICE }); // trade 1
      await attacker.createTrade(2, LISTING_HASH, { value: PRICE }); // trade 2
      await escrow.connect(seller).cancelTrade(2);

      await attacker.setMode(PartyMode.Reenter, escrow.interface.encodeFunctionData("withdraw"));

      await expect(attacker.withdraw()).to.changeEtherBalances([escrow, attacker], [-PRICE, PRICE]);
      await expectGuardBlocked(escrow, attacker);
      // The honest buyer's money is still in escrow
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(PRICE);
    });

    it("blocks a malicious seller re-entering withdrawTo during its payout", async function () {
      const { escrow, buyer } = await loadFixture(deployFixture);
      const attacker = await deployParty(escrow);

      await attacker.createListing(PRICE);
      await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
      await attacker.markShipped(TRADE_ID);
      await escrow.connect(buyer).confirmReceipt(TRADE_ID);

      await attacker.setMode(
        PartyMode.Reenter,
        escrow.interface.encodeFunctionData("withdrawTo", [await attacker.getAddress()])
      );

      await expect(attacker.withdraw()).to.changeEtherBalances([escrow, attacker], [-PRICE, PRICE]);
      await expectGuardBlocked(escrow, attacker);
      expect(await escrow.pendingWithdrawals(await attacker.getAddress())).to.equal(0);
    });
  });

  describe("non-payable recipient", function () {
    it("a seller that rejects ETH does not block the buyer, and can still withdrawTo", async function () {
      const { escrow, buyer, other } = await loadFixture(deployFixture);
      const badSeller = await deployParty(escrow);
      const badSellerAddress = await badSeller.getAddress();

      await badSeller.createListing(PRICE);
      await escrow.connect(buyer).createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
      await badSeller.markShipped(TRADE_ID);
      await badSeller.setMode(PartyMode.Reject, "0x");

      // Buyer's confirm succeeds even though the seller cannot receive ETH
      await escrow.connect(buyer).confirmReceipt(TRADE_ID);
      expect((await escrow.getTrade(TRADE_ID)).status).to.equal(TradeStatus.Completed);
      expect(await escrow.hasTraded(buyer.address)).to.equal(1);

      // Withdrawing to itself fails and rolls back, so the balance is kept...
      await expect(badSeller.withdraw()).to.be.revertedWithCustomError(escrow, "TransferFailed");
      expect(await escrow.pendingWithdrawals(badSellerAddress)).to.equal(PRICE);

      // ...and it can get the money out to another address
      await expect(badSeller.withdrawTo(other.address)).to.changeEtherBalances(
        [escrow, other],
        [-PRICE, PRICE]
      );
    });

    it("a buyer that rejects ETH does not block the seller cancelling", async function () {
      const { escrow, seller, other } = await loadFixture(listedFixture);
      const badBuyer = await deployParty(escrow);

      await badBuyer.createTrade(LISTING_ID, LISTING_HASH, { value: PRICE });
      await badBuyer.setMode(PartyMode.Reject, "0x");

      await escrow.connect(seller).cancelTrade(TRADE_ID);
      expect((await escrow.getTrade(TRADE_ID)).status).to.equal(TradeStatus.Refunded);
      expect((await escrow.getListing(LISTING_ID)).status).to.equal(ListingStatus.Active);

      await expect(badBuyer.withdraw()).to.be.revertedWithCustomError(escrow, "TransferFailed");
      await expect(badBuyer.withdrawTo(other.address)).to.changeEtherBalance(other, PRICE);
    });
  });
});
