import mysql, {  ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface Options {
    query: string;
    values?: any[];
}

// ============ 安全改进: 移除硬编码，强制使用环境变量 ============
// 数据库配置 - 必须从环境变量读取，禁止硬编码
const dbConfig = {
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,  // ✅ 移除硬编码密码
  database: process.env.DB_NAME!,
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
  queueLimit: dbConfig.queueLimit,
  dateStrings: true,

  // READ COMMITTED: 消除 next-key lock（间隙锁），减少锁等待
  // 注意: MySQL2 不支持 sessionVariables，需要在每个连接建立后手动设置
});

// 设置默认事务隔离级别为 READ COMMITTED
pool.on('connection', (connection) => {
  connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
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