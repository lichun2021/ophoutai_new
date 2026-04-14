import {sql} from '../db';




export const updateApiUrl = async (apiUrl:string) => {
    await sql({
        query: 'UPDATE Apis SET apiurl = ? WHERE id = 999',
        values: [apiUrl],
    });
}

export const getApiUrl = async () => {

    const result = await sql({
        query: 'SELECT apiurl FROM Apis WHERE id = 999',
    }) as any;
    console.log("getApiUrl",result);
    return result.length === 1 ? result[0].apiurl : null;
};

