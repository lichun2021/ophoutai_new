import {sql} from '../db';

export type AgentRelationship = {
    id?: number;
    parent_channel_code: string;
    child_channel_code: string;
    created_at?: string;
};

export const findByParentChannelCode = async (parent_channel_code: string) => {
    const result = await sql({
        query: 'SELECT * FROM agentrelationships WHERE parent_channel_code = ? ORDER BY created_at DESC',
        values: [parent_channel_code],
    }) as any;
    return result as AgentRelationship[];
};

export const findByChildChannelCode = async (child_channel_code: string) => {
    const result = await sql({
        query: 'SELECT * FROM agentrelationships WHERE child_channel_code = ? ORDER BY created_at DESC',
        values: [child_channel_code],
    }) as any;
    return result as AgentRelationship[];
};

export const read = async () => {
    const relationships = await sql({
        query: 'SELECT * FROM agentrelationships ORDER BY created_at DESC',
    });
    return relationships as AgentRelationship[];
};

export const insert = async (relationshipData: Omit<AgentRelationship, 'id' | 'created_at'>) => {
    const result = await sql({
        query: 'INSERT INTO agentrelationships (parent_channel_code, child_channel_code) VALUES (?, ?)',
        values: [
            relationshipData.parent_channel_code,
            relationshipData.child_channel_code,
        ],
    });
    return result;
};

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM agentrelationships WHERE id = ?',
        values: [id],
    });
};

// 获取某个渠道的所有下级渠道（递归）
export const getAllChildChannelCodes = async (parentChannelCode: string): Promise<string[]> => {
    const directChildren = await findByParentChannelCode(parentChannelCode);
    let allChildren: string[] = [];
    
    for (const child of directChildren) {
        allChildren.push(child.child_channel_code);
        // 递归获取下级的下级
        const grandChildren = await getAllChildChannelCodes(child.child_channel_code);
        allChildren = allChildren.concat(grandChildren);
    }
    
    return [...new Set(allChildren)]; // 去重
};

// 获取某个渠道的直接下级渠道
export const getDirectChildChannelCodes = async (parentChannelCode: string): Promise<string[]> => {
    const directChildren = await findByParentChannelCode(parentChannelCode);
    return directChildren.map(child => child.child_channel_code);
};

// 获取某个渠道的上级渠道
export const getParentChannelCode = async (childChannelCode: string): Promise<string | null> => {
    const parents = await findByChildChannelCode(childChannelCode);
    return parents.length > 0 ? parents[0].parent_channel_code : null;
}; 

