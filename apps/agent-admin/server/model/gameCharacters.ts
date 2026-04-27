import {sql} from '../db';

export type GameCharacter = {
    id?: number;
    user_id: number;
    subuser_id: number;
    game_id: number;
    uuid: string;
    character_name: string;
    character_level?: number;
    server_name: string;
    server_id?: number;
    ext?: string | object;
    last_login_at?: string;
    created_at?: string;
};

export const findByUuid = async (uuid: string) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE uuid = ? LIMIT 1',
        values: [uuid],
    }) as any;
    return result.length > 0 ? result[0] as GameCharacter : null;
};

export const findByUserId = async (user_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE user_id = ? ORDER BY created_at DESC',
        values: [user_id],
    }) as any;
    return result as GameCharacter[];
};

export const findBySubUserId = async (subuser_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE subuser_id = ? ORDER BY created_at DESC',
        values: [subuser_id],
    }) as any;
    return result as GameCharacter[];
};

export const findByGameId = async (game_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE game_id = ? ORDER BY created_at DESC',
        values: [game_id],
    }) as any;
    return result as GameCharacter[];
};

export const findByUserAndGame = async (user_id: number, game_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE user_id = ? AND game_id = ? ORDER BY created_at DESC',
        values: [user_id, game_id],
    }) as any;
    return result as GameCharacter[];
};

export const findBySubUserAndGame = async (subuser_id: number, game_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM gamecharacters WHERE subuser_id = ? AND game_id = ? ORDER BY created_at DESC',
        values: [subuser_id, game_id],
    }) as any;
    return result as GameCharacter[];
};

export const read = async () => {
    const characters = await sql({
        query: 'SELECT * FROM gamecharacters ORDER BY created_at DESC',
    });
    return characters as GameCharacter[];
};

export const readPage = async (pageIndex: number, pageSize: number = 10, user_id?: number, subuser_id?: number, game_id?: number) => {
    const offset = (pageIndex - 1) * pageSize;
    
    let _sql = {
        query: 'SELECT * FROM gamecharacters',
        values: [] as number[],
    };
    
    const conditions = [];
    
    if (user_id !== undefined) {
        conditions.push('user_id = ?');
        _sql.values.push(user_id);
    }
    
    if (subuser_id !== undefined) {
        conditions.push('subuser_id = ?');
        _sql.values.push(subuser_id);
    }
    
    if (game_id !== undefined) {
        conditions.push('game_id = ?');
        _sql.values.push(game_id);
    }
    
    if (conditions.length > 0) {
        _sql.query += ' WHERE ' + conditions.join(' AND ');
    }
    
    _sql.query += ' ORDER BY created_at DESC LIMIT ?, ?';
    _sql.values.push(offset, pageSize);
    
    const characters = await sql(_sql);
    return characters as GameCharacter[];
};

export const count = async (user_id?: number, subuser_id?: number, game_id?: number) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM gamecharacters',
            values: [] as number[],
        };
        
        const conditions = [];
        
        if (user_id !== undefined) {
            conditions.push('user_id = ?');
            _sql.values.push(user_id);
        }
        
        if (subuser_id !== undefined) {
            conditions.push('subuser_id = ?');
            _sql.values.push(subuser_id);
        }
        
        if (game_id !== undefined) {
            conditions.push('game_id = ?');
            _sql.values.push(game_id);
        }
        
        if (conditions.length > 0) {
            _sql.query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const result: any = await sql(_sql);
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count GameCharacters:', error);
        return 0;
    }
};

// 辅助函数：处理 ext 字段，确保它是有效的 JSON 字符串或 null
const normalizeExtData = (ext: any): string | null => {
    if (!ext) return null;
    
    if (typeof ext === 'object') {
        return JSON.stringify(ext);
    } else if (typeof ext === 'string') {
        try {
            // 尝试解析字符串为 JSON
            JSON.parse(ext);
            return ext;
        } catch {
            // 如果不是有效的 JSON，则包装成对象
            return JSON.stringify({ value: ext });
        }
    }
    return null;
};

export const insert = async (characterData: Omit<GameCharacter, 'id' | 'created_at'>) => {
    const extData = normalizeExtData(characterData.ext);
    
    const result = await sql({
        query: 'INSERT INTO gamecharacters (user_id, subuser_id, game_id, uuid, character_name, character_level, server_name, server_id, ext, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        values: [
            characterData.user_id,
            characterData.subuser_id,
            characterData.game_id,
            characterData.uuid,
            characterData.character_name,
            characterData.character_level || 1,
            characterData.server_name,
            characterData.server_id || 1,
            extData,
            characterData.last_login_at || null,
        ],
    });
    return result;
};

// 角色上报：基于 子账号ID + 角色UUID 判定（存在则更新，不存在则插入）
export const upsertByUuid = async (characterData: Omit<GameCharacter, 'id' | 'created_at'>) => {
    try {
        const extData = normalizeExtData(characterData.ext);
        const characterLevel = characterData.character_level || 1;
        
        // 1. 先根据 subuser_id + uuid 查询角色是否已存在
        const existingResult = await sql({
            query: 'SELECT id, server_id, server_name FROM gamecharacters WHERE subuser_id = ? AND uuid = ? LIMIT 1',
            values: [characterData.subuser_id, characterData.uuid],
        }) as any[];
        
        if (existingResult.length > 0) {
            // 2. 如果已存在，则执行更新（不更新 server_id 和 server_name）
            const existingId = existingResult[0].id;
            
            await sql({
                query: `
                    UPDATE gamecharacters 
                    SET 
                        character_name = ?, 
                        character_level = ?, 
                        ext = ?, 
                        last_login_at = NOW() 
                    WHERE id = ?
                `,
                values: [
                    characterData.character_name,
                    characterLevel,
                    extData,
                    existingId
                ],
            });
            
            console.log(`角色上报成功: 更新信息 uuid=${characterData.uuid}, 服务器ID=${existingResult[0].server_id}`);
            return { isNew: false, id: existingId };
        } else {
            // 3. 如果不存在，则执行插入
            const result = await sql({
                query: `
                    INSERT INTO gamecharacters 
                    (user_id, subuser_id, game_id, uuid, character_name, character_level, server_name, server_id, ext, last_login_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `,
                values: [
                    characterData.user_id,
                    characterData.subuser_id,
                    characterData.game_id,
                    characterData.uuid,
                    characterData.character_name,
                    characterLevel,
                    characterData.server_name,
                    characterData.server_id || 1,
                    extData,
                ],
            }) as any;
            
            const id = result.insertId || result.lastInsertId;
            console.log(`角色上报成功: 新建角色 uuid=${characterData.uuid}, 服务器ID=${characterData.server_id || 1}`);
            return { isNew: true, id };
        }
    } catch (error: any) {
        console.error('角色上报失败:', error);
        throw error;
    }
};

export const update = async (id: number, characterData: Partial<Omit<GameCharacter, 'id' | 'created_at'>>) => {
    const fields = [];
    const values = [];
    
    if (characterData.user_id !== undefined) {
        fields.push('user_id = ?');
        values.push(characterData.user_id);
    }
    if (characterData.subuser_id !== undefined) {
        fields.push('subuser_id = ?');
        values.push(characterData.subuser_id);
    }
    if (characterData.game_id !== undefined) {
        fields.push('game_id = ?');
        values.push(characterData.game_id);
    }
    if (characterData.uuid !== undefined) {
        fields.push('uuid = ?');
        values.push(characterData.uuid);
    }
    if (characterData.character_name !== undefined) {
        fields.push('character_name = ?');
        values.push(characterData.character_name);
    }
    if (characterData.character_level !== undefined) {
        fields.push('character_level = ?');
        values.push(characterData.character_level);
    }
    if (characterData.server_name !== undefined) {
        fields.push('server_name = ?');
        values.push(characterData.server_name);
    }
    if (characterData.server_id !== undefined) {
        fields.push('server_id = ?');
        values.push(characterData.server_id);
    }
    if (characterData.ext !== undefined) {
        const extData = typeof characterData.ext === 'object' ? JSON.stringify(characterData.ext) : characterData.ext;
        fields.push('ext = ?');
        values.push(extData);
    }
    if (characterData.last_login_at !== undefined) {
        fields.push('last_login_at = ?');
        values.push(characterData.last_login_at);
    }
    
    if (fields.length > 0) {
        values.push(id);
        
        await sql({
            query: `UPDATE gamecharacters SET ${fields.join(', ')} WHERE id = ?`,
            values: values,
        });
    }
};

export const updateLastLogin = async (id: number, last_login_at: string) => {
    await sql({
        query: 'UPDATE gamecharacters SET last_login_at = ? WHERE id = ?',
        values: [last_login_at, id],
    });
};

export const updateLevel = async (id: number, character_level: number) => {
    await sql({
        query: 'UPDATE gamecharacters SET character_level = ? WHERE id = ?',
        values: [character_level, id],
    });
};

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM gamecharacters WHERE id = ?',
        values: [id],
    });
};

export const removeByUserId = async (user_id: number) => {
    await sql({
        query: 'DELETE FROM gamecharacters WHERE user_id = ?',
        values: [user_id],
    });
};

export const removeBySubUserId = async (subuser_id: number) => {
    await sql({
        query: 'DELETE FROM gamecharacters WHERE subuser_id = ?',
        values: [subuser_id],
    });
}; 