import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface Options {
  query: string;
  values?: any[];
}

// 数据库配置 - 使用环境变量，带默认值
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234',
  database: process.env.DB_NAME || 'quantum_db',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '500'),
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '0')
};

// 谨慎日志：避免打印数据库敏感信息
// console.log('🔧 数据库配置已加载');

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,

  waitForConnections: true,
  connectionLimit: dbConfig.connectionLimit,
  queueLimit: dbConfig.queueLimit
});

pool.on('enqueue', () => {
  console.error('Database connection error:');
});

export const sql = async ({ query, values = [] }: Options) => {
  try {
    const [rows] = await pool.query<RowDataPacket[] | ResultSetHeader>(query, values);
    return rows;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
};

// 导出连接池，用于需要事务和锁的场景
export { pool };