import {sql} from '../db';

export type Game = {
    id?: number;
    game_name: string;
    icon_url: string;
    supported_devices: 'H5' | 'iOS' | 'Android' | 'Dual' | 'All';
    register_url?: string;
    ios_download_url?: string;
    android_download_url?: string;
    description?: string;
    is_active?: number;
    created_at?: string;
    updated_at?: string;
};

export const findByGameName = async (game_name: string) => {
    const result = await sql({
        query: 'SELECT * FROM games WHERE game_name = ?',
        values: [game_name],
    }) as any;
    return result.length === 1 ? result[0] as Game : null;
};

export const findById = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM games WHERE id = ?',
        values: [id],
    }) as any;
    return result.length === 1 ? result[0] as Game : null;
};

export const findByDevice = async (device: string) => {
    const result = await sql({
        query: 'SELECT * FROM games WHERE supported_devices = ? OR supported_devices = "All" ORDER BY created_at DESC',
        values: [device],
    }) as any;
    return result as Game[];
};

export const findActive = async () => {
    const result = await sql({
        query: 'SELECT * FROM games WHERE is_active = 1 ORDER BY created_at DESC',
    }) as any;
    return result as Game[];
};

export const read = async () => {
    const games = await sql({
        query: 'SELECT * FROM games ORDER BY created_at DESC',
    });
    return games as Game[];
};

export const readPage = async (pageIndex: number, pageSize: number = 10, is_active?: number, supported_devices?: string) => {
    const offset = (pageIndex - 1) * pageSize;
    
    let _sql = {
        query: 'SELECT * FROM games',
        values: [] as (string | number)[],
    };
    
    const conditions = [];
    
    if (is_active !== undefined) {
        conditions.push('is_active = ?');
        _sql.values.push(is_active);
    }
    
    if (supported_devices) {
        conditions.push('(supported_devices = ? OR supported_devices = "All")');
        _sql.values.push(supported_devices);
    }
    
    if (conditions.length > 0) {
        _sql.query += ' WHERE ' + conditions.join(' AND ');
    }
    
    _sql.query += ' ORDER BY created_at DESC LIMIT ?, ?';
    _sql.values.push(offset, pageSize);
    
    const games = await sql(_sql);
    return games as Game[];
};

export const count = async (is_active?: number, supported_devices?: string) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM games',
            values: [] as (string | number)[],
        };
        
        const conditions = [];
        
        if (is_active !== undefined) {
            conditions.push('is_active = ?');
            _sql.values.push(is_active);
        }
        
        if (supported_devices) {
            conditions.push('(supported_devices = ? OR supported_devices = "All")');
            _sql.values.push(supported_devices);
        }
        
        if (conditions.length > 0) {
            _sql.query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const result: any = await sql(_sql);
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count Games:', error);
        return 0;
    }
};

export const insert = async (gameData: Omit<Game, 'id' | 'created_at' | 'updated_at'>) => {
    const result = await sql({
        query: 'INSERT INTO games (game_name, icon_url, supported_devices, register_url, ios_download_url, android_download_url, description, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        values: [
            gameData.game_name,
            gameData.icon_url,
            gameData.supported_devices,
            gameData.register_url || '',
            gameData.ios_download_url || '',
            gameData.android_download_url || '',
            gameData.description || null,
            gameData.is_active !== undefined ? gameData.is_active : 1
        ],
    });
    return result;
};

export const update = async (id: number, gameData: Partial<Omit<Game, 'id' | 'created_at' | 'updated_at'>>) => {
    const fields = [];
    const values = [];
    
    if (gameData.game_name !== undefined) {
        fields.push('game_name = ?');
        values.push(gameData.game_name);
    }
    if (gameData.icon_url !== undefined) {
        fields.push('icon_url = ?');
        values.push(gameData.icon_url);
    }
    if (gameData.supported_devices !== undefined) {
        fields.push('supported_devices = ?');
        values.push(gameData.supported_devices);
    }
    if (gameData.register_url !== undefined) {
        fields.push('register_url = ?');
        values.push(gameData.register_url);
    }
    if (gameData.ios_download_url !== undefined) {
        fields.push('ios_download_url = ?');
        values.push(gameData.ios_download_url);
    }
    if (gameData.android_download_url !== undefined) {
        fields.push('android_download_url = ?');
        values.push(gameData.android_download_url);
    }
    if (gameData.description !== undefined) {
        fields.push('description = ?');
        values.push(gameData.description);
    }
    if (gameData.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(gameData.is_active);
    }
    
    if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id);
        
        await sql({
            query: `UPDATE games SET ${fields.join(', ')} WHERE id = ?`,
            values: values,
        });
    }
};

export const updateStatus = async (id: number, is_active: number) => {
    await sql({
        query: 'UPDATE games SET is_active = ?, updated_at = NOW() WHERE id = ?',
        values: [is_active, id],
    });
};

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM games WHERE id = ?',
        values: [id],
    });
}; 