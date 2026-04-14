
import * as logModel from '../model/logs';
export async function writeLog(message: string,filname:string) {
    
   logModel.insert({type:filname,content:message});
    // const logDir = join(process.cwd(), 'logs');
    // const logFile = join(logDir, filname + '.log');

    // try {
    //     // 确保日志目录存在
    //     await fs.mkdir(logDir, { recursive: true });

    //     // 获取当前时间并格式化
    //     const timestamp = new Date().toISOString();
    //     const logMessage = `${timestamp} - ${message}\n`;

    //     // 将日志写入文件
    //     await fs.appendFile(logFile, logMessage, 'utf-8');
    // } catch (error) {
    //     console.error('Failed to write log:', error);
    // }
}


