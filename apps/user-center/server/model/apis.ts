import {sql} from '../db';




export const updateApiUrl = async (apiUrl:string) => {
    await sql({
        query: 'UPDATE apis SET apiurl = ? WHERE id = 999',
        values: [apiUrl],
    });
}

export const getApiUrl = async () => {

    const result = await sql({
        query: 'SELECT apiurl FROM apis WHERE id = 999',
    }) as any;
    console.log("getApiUrl",result);
    return result.length === 1 ? result[0].apiurl : null;
};
