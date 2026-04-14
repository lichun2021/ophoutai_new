import {sql} from '../db';


export type log = {
    type: string;
    content: string;
};


export const insert = async (logData:log) => {
    const result = await sql({
        query: 'INSERT INTO logs (log_type, log_content) VALUES (?, ?)',
        values: [logData.type, logData.content],
    });

    return result;
};