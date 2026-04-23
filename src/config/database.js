const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pawdeal',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Test database connection
const testConnection = async () => {
    try {
        const connection = await promisePool.getConnection();
        console.log('✅ MySQL database connected successfully!');
        console.log(`   Database: ${process.env.DB_NAME}`);
        console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   Make sure MySQL is running in XAMPP');
        }
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   Check your database credentials in .env file');
        }
        if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('   Database does not exist. Run: npm run init-db');
        }
        return false;
    }
};

// Helper function to execute queries
const query = async (sql, params) => {
    try {
        const [results] = await promisePool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error.message);
        throw error;
    }
};

// Helper function to get a single row
const getOne = async (sql, params) => {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
};

// Helper function to insert and get insert ID
const insert = async (sql, params) => {
    const [result] = await promisePool.execute(sql, params);
    return result;
};

// Begin transaction
const beginTransaction = async () => {
    const connection = await promisePool.getConnection();
    await connection.beginTransaction();
    return connection;
};

// Commit transaction
const commit = async (connection) => {
    await connection.commit();
    connection.release();
};

// Rollback transaction
const rollback = async (connection) => {
    await connection.rollback();
    connection.release();
};

module.exports = {
    pool: promisePool,
    query,
    getOne,
    insert,
    beginTransaction,
    commit,
    rollback,
    testConnection
};