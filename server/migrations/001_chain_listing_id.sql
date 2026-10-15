-- Links each database listing to its listing in the escrow contract.
-- Run once on the database before using buying/selling.
ALTER TABLE listings
    ADD COLUMN chain_listing_id INT UNSIGNED NULL UNIQUE;

-- listings.status must allow these values (they mirror the contract):
--   active, reserved (paid, in escrow), sold, cancelled
-- If status is an ENUM without 'reserved' or 'sold', also run:
-- ALTER TABLE listings
--     MODIFY status ENUM('active', 'reserved', 'sold', 'cancelled') NOT NULL DEFAULT 'active';
