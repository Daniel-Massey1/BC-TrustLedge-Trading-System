
require("dotenv").config();

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const db = mysql.createPool({
    host: process.env.CLOUD_DB_HOST,
    port: Number(process.env.CLOUD_DB_PORT),
    user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD,
    database: process.env.CLOUD_DB_NAME,

    ssl: {
        ca: fs.readFileSync(path.join(__dirname, "ca.pem")),
        rejectUnauthorized: true
    },

    waitForConnections: true,
    connectionLimit: 10
});

module.exports = db;
