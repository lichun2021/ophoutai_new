/**
 * Database configuration
 */
export const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234',
    database: process.env.DB_NAME || 'quantum_db',
    charset: 'utf8mb4',
    timezone: '+08:00'
};

/**
 * Logging functions
 */
export const logInfo = (message) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`);
};

export const logError = (message) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
};

export const logWarn = (message) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
}; 
