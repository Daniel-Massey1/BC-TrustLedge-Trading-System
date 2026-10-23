
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("./db");
const { readChainListing, parseEther } = require("./escrow");

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
    origin: "http://localhost:5173"
}));

app.use(express.json());

// Create uploads folder if needed
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Allow the frontend to view uploaded images
app.use("/uploads", express.static(uploadDir));

// Configure image storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const extension =
            file.mimetype === "image/png" ? ".png" : ".jpg";

        cb(null, crypto.randomUUID() + extension);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (["image/jpeg", "image/png"].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG and PNG images are allowed"));
        }
    }
});

// Backend test
app.get("/", (req, res) => {
    res.send("TrustLedge Backend is Working!");
});

// GET all active listings with their first image
app.get("/api/listings", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT l.*,
                (
                    SELECT li.file_path
                    FROM listing_images li
                    WHERE li.listing_id = l.listing_id
                    ORDER BY li.sort_order, li.image_id
                    LIMIT 1
                ) AS image_url
            FROM listings l
            WHERE l.status = 'active'
            ORDER BY l.created_at DESC, l.listing_id DESC
        `);

        res.json(rows);

    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            error: "Failed to retrieve listings"
        });
    }
});

// GET a single listing by ID
app.get("/api/listings/:id", async (req, res) => {
    try {
        const listingId = Number(req.params.id);

        if (!Number.isSafeInteger(listingId) || listingId <= 0) {
            return res.status(400).json({
                error: "Invalid listing ID"
            });
        }

        const [rows] = await db.query(`
            SELECT l.*,
                (
                    SELECT li.file_path
                    FROM listing_images li
                    WHERE li.listing_id = l.listing_id
                    ORDER BY li.sort_order, li.image_id
                    LIMIT 1
                ) AS image_url
            FROM listings l
            WHERE l.listing_id = ?
        `, [listingId]);

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Listing not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error retrieving listing:", error);

        res.status(500).json({
            error: "Failed to retrieve listing"
        });
    }
});

// GET all listings belonging to a specific seller
app.get("/api/sellers/:wallet/listings", async (req, res) => {
    try {
        const wallet = req.params.wallet.toLowerCase();

        if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
            return res.status(400).json({
                error: "Invalid wallet address"
            });
        }

        const [rows] = await db.query(`
            SELECT l.*,
                (
                    SELECT li.file_path
                    FROM listing_images li
                    WHERE li.listing_id = l.listing_id
                    ORDER BY li.sort_order, li.image_id
                    LIMIT 1
                ) AS image_url
            FROM listings l
            WHERE l.seller_wallet = ?
            ORDER BY l.created_at DESC, l.listing_id DESC
        `, [wallet]);

        res.json(rows);

    } catch (error) {
        console.error("Error retrieving seller listings:", error);

        res.status(500).json({
            error: "Failed to retrieve seller listings"
        });
    }
});

// POST a new listing with an optional image
app.post("/api/listings", upload.single("image"), async (req, res) => {
    const uploadedFile = req.file;

    try {
        const {
            seller_wallet,
            title,
            description,
            category,
            price,
            chain_listing_id
        } = req.body;

        const numericPrice = Number(price);

        // Validate required fields
        if (!seller_wallet || !title || !price) {
            return res.status(400).json({
                error: "Seller wallet, title and price are required"
            });
        }

        // Validate wallet address
        if (!/^0x[a-fA-F0-9]{40}$/.test(seller_wallet)) {
            return res.status(400).json({
                error: "Invalid wallet address"
            });
        }

        // Validate title and price
        if (
            typeof title !== "string" ||
            !title.trim() ||
            !Number.isFinite(numericPrice) ||
            numericPrice <= 0 ||
            numericPrice > 9999999999
        ) {
            return res.status(400).json({
                error: "Invalid title or price"
            });
        }

        const wallet = seller_wallet.toLowerCase();

        // The seller registered the listing with the escrow contract first.
        // Check the contract agrees on seller and price, so the database
        // can't advertise a different price from the one buyers must pay.
        const chainListingId = Number(chain_listing_id);

        if (!Number.isSafeInteger(chainListingId) || chainListingId <= 0) {
            return res.status(400).json({
                error: "Listing must be registered with the escrow contract"
            });
        }

        const onChain = await readChainListing(chainListingId);

        if (
            onChain.status !== "active" ||
            onChain.seller !== wallet ||
            onChain.price !== parseEther(String(price))
        ) {
            return res.status(400).json({
                error: "Escrow contract listing does not match this seller and price"
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // Temporary prototype wallet registration
            // MetaMask authentication will replace this later
            await connection.query(
                "INSERT IGNORE INTO users (wallet_address) VALUES (?)",
                [wallet]
            );

            // Insert listing into MySQL
            const [result] = await connection.query(
                `INSERT INTO listings
                 (seller_wallet, title, description, category, price, chain_listing_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    wallet,
                    title.trim(),
                    description || null,
                    category || "Other",
                    price,
                    chainListingId
                ]
            );

            const listingId = result.insertId;

            // Save image path if an image was uploaded
            if (uploadedFile) {
                await connection.query(
                    `INSERT INTO listing_images
                     (listing_id, file_path, sort_order)
                     VALUES (?, ?, ?)`,
                    [
                        listingId,
                        `/uploads/${uploadedFile.filename}`,
                        0
                    ]
                );
            }

            await connection.commit();

            res.status(201).json({
                message: "Listing created successfully",
                listing_id: listingId,
                image_url: uploadedFile
                    ? `/uploads/${uploadedFile.filename}`
                    : null
            });

        } catch (error) {
            await connection.rollback();
            throw error;

        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("Error creating listing:", error);

        res.status(500).json({
            error: "Failed to create listing"
        });

    } finally {
        // Remove uploaded image if listing creation failed
        if (uploadedFile && res.statusCode !== 201) {
            fs.promises.unlink(uploadedFile.path).catch(() => {});
        }
    }
});

// GET a listing by its escrow contract id (used to show trades in My Account)
app.get("/api/chain-listings/:chainId", async (req, res) => {
    try {
        const chainListingId = Number(req.params.chainId);

        if (!Number.isSafeInteger(chainListingId) || chainListingId <= 0) {
            return res.status(400).json({
                error: "Invalid listing ID"
            });
        }

        const [rows] = await db.query(`
            SELECT l.*,
                (
                    SELECT li.file_path
                    FROM listing_images li
                    WHERE li.listing_id = l.listing_id
                    ORDER BY li.sort_order, li.image_id
                    LIMIT 1
                ) AS image_url
            FROM listings l
            WHERE l.chain_listing_id = ?
        `, [chainListingId]);

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Listing not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error retrieving listing:", error);

        res.status(500).json({
            error: "Failed to retrieve listing"
        });
    }
});

// POST sync: copy a listing's status from the escrow contract into the database.
// Called after buy / cancel / confirm. Anyone can call it safely, because
// the new status comes from the contract, not from the request.
app.post("/api/chain-listings/:chainId/sync", async (req, res) => {
    try {
        const chainListingId = Number(req.params.chainId);

        if (!Number.isSafeInteger(chainListingId) || chainListingId <= 0) {
            return res.status(400).json({
                error: "Invalid listing ID"
            });
        }

        const onChain = await readChainListing(chainListingId);

        if (!onChain.status) {
            return res.status(404).json({
                error: "Listing not found in the escrow contract"
            });
        }

        await db.query(
            "UPDATE listings SET status = ? WHERE chain_listing_id = ?",
            [onChain.status, chainListingId]
        );

        res.json({
            chain_listing_id: chainListingId,
            status: onChain.status
        });

    } catch (error) {
        console.error("Error syncing listing:", error);

        res.status(500).json({
            error: "Failed to sync listing"
        });
    }
});

 // DELETE listing (soft delete)
app.delete("/api/listings/:id", async (req, res) => {
    try {
        const listingId = Number(req.params.id);

        if (!Number.isSafeInteger(listingId) || listingId <= 0) {
            return res.status(400).json({
                error: "Invalid listing ID"
            });
        }

        // Temporary prototype protection:
        // Disabled until wallet authentication is implemented.
        if (process.env.ENABLE_TEST_DELETE !== "true") {
            return res.status(403).json({
                error: "Listing deletion is disabled until seller authentication is implemented"
            });
        }

        const [result] = await db.query(
            `UPDATE listings
             SET status = 'cancelled'
             WHERE listing_id = ? AND status = 'active'`,
            [listingId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Active listing not found"
            });
        }

        res.json({
            message: "Listing cancelled successfully",
            listing_id: listingId
        });

    } catch (error) {
        console.error("Error cancelling listing:", error);
        res.status(500).json({
            error: "Failed to cancel listing"
        });
    }
});


// Handle image upload errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: err.code === "LIMIT_FILE_SIZE"
                ? "Image must be smaller than 5 MB"
                : err.message
        });
    }

    if (err) {
        return res.status(400).json({
            error: err.message
        });
    }

    next();
});

// Start backend server
app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});
