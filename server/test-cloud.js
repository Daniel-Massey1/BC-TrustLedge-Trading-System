
require("dotenv").config();

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

async function testCloud() {
    let connection;

    try {
        connection = await mysql.createConnection({
            host: process.env.CLOUD_DB_HOST,
            port: Number(process.env.CLOUD_DB_PORT),
            user: process.env.CLOUD_DB_USER,
            password: process.env.CLOUD_DB_PASSWORD,
            database: process.env.CLOUD_DB_NAME,
            ssl: {
                ca: fs.readFileSync(path.join(__dirname, "ca.pem")),
                rejectUnauthorized: true
            }
        });

        const [rows] = await connection.query(
            "SELECT DATABASE() AS database_name"
        );

        console.log("Cloud MySQL connection successful!");
        console.log(rows);

    } catch (error) {
        console.error("Cloud connection failed:", error.message);
    } finally {
        if (connection) await connection.end();
    }
}

testCloud();
