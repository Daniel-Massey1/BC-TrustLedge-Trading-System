// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../TrustLedgeEscrow.sol";

/// @notice TEST ONLY. A contract account that plays buyer or seller in the
///         escrow so tests can check how the escrow handles hostile recipients.
///         - Accept:  receives ETH normally
///         - Reject:  reverts on every ETH transfer (non-payable recipient)
///         - Reenter: calls back into the escrow while receiving ETH
contract EscrowTestParty {
    enum Mode {
        Accept,
        Reject,
        Reenter
    }

    TrustLedgeEscrow public immutable escrow;
    Mode public mode;
    bytes public reentryCall;

    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;

    constructor(TrustLedgeEscrow _escrow) {
        escrow = _escrow;
    }

    function setMode(Mode _mode, bytes calldata _reentryCall) external {
        mode = _mode;
        reentryCall = _reentryCall;
    }

    function createListing(uint256 price) external returns (uint256) {
        return escrow.createListing(price);
    }

    function createTrade(uint256 listingId, bytes32 listingHash) external payable returns (uint256) {
        return escrow.createTrade{value: msg.value}(listingId, listingHash);
    }

    function markShipped(uint256 tradeId) external {
        escrow.markShipped(tradeId, "TEST");
    }

    function confirmReceipt(uint256 tradeId) external {
        escrow.confirmReceipt(tradeId);
    }

    function cancelTrade(uint256 tradeId) external {
        escrow.cancelTrade(tradeId);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    function withdrawTo(address payable to) external {
        escrow.withdrawTo(to);
    }

    receive() external payable {
        if (mode == Mode.Reject) revert("EscrowTestParty: rejecting ETH");

        if (mode == Mode.Reenter && !reentryAttempted) {
            reentryAttempted = true;
            // Record the outcome instead of reverting, so the outer payout
            // still succeeds and the test can inspect why re-entry failed.
            (bool ok, bytes memory data) = address(escrow).call(reentryCall);
            reentrySucceeded = ok;
            reentryRevertData = data;
        }
    }
}