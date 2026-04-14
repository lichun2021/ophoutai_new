import {sql} from '../db';

export type Admin = {
    id: number;
    level: number;
    name: string;
    password: string;
    channel_code?: string;
    created_at?: string;
    updated_at?: string;
    settlement_type?: number;
    settlement_amount?: number;
    settlement_amount_available?: number;
    divide_rate?: number; // 分成比例(百分比)
    platform_coins?: number; // 平台币总额
    available_platform_coins?: number; // 可用平台币余额
    tg_account?: string;
    qq_account?: string;
    email?: string;
    phone?: string;
    is_active?: boolean; // 是否启用：true=启用,false=禁用
    allowed_channel_codes?: string[]; // JSON数组，存储允许访问的渠道代码
    allowed_game_ids?: number[]; // JSON数组，存储允许访问的游戏ID
    u_address?: string; // U地址(USDT钱包地址)
    google_2fa_secret?: string; // Google 2FA 密钥
};

export const getAdminLevel = async (id:number) => {
    const result = await sql({
        query: 'SELECT level FROM Admins WHERE id = ?',
        values: [id],
    }) as any;
    // console.log("getAdminLevel",result,id);
    return result.length === 1 ? result[0].level : null;
}


export const login = async (name: string,password:string) => {
    const result = await sql({
        query: 'SELECT * FROM Admins WHERE name = ? and password = ?',
        values: [name,password],
    }) as any;
    return result.length === 1 ? result[0] as Admin : null;
};

export const getByName = async (name: string) => {
    const result = await sql({
        query: 'SELECT * FROM Admins WHERE name = ? LIMIT 1',
        values: [name],
    }) as any;
    return result.length === 1 ? result[0] as Admin : null;
};

export const read = async () => {
    const users = await sql({
        query: 'SELECT * FROM Admins',
    });
    return users as Admin[];
}

export const updatePassword = async (id: number, data: Pick<Admin,"password">) => {
    await sql({
        query: 'UPDATE Admins SET password = ? WHERE id = ?',
        values: [data.password, id],
    });
}

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM Admins WHERE id = ?',
        values: [id],
    });
}

export const insert = async (adminData: Omit<Admin, 'id' | 'created_at' | 'updated_at'>) => {
    const result = await sql({
        query: 'INSERT INTO Admins (level, name, password, channel_code, settlement_type, settlement_amount, settlement_amount_available, divide_rate, platform_coins, available_platform_coins, tg_account, qq_account, email, phone, is_active, allowed_channel_codes, allowed_game_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        values: [
            adminData.level, 
            adminData.name, 
            adminData.password, 
            adminData.channel_code || '', 
            adminData.settlement_type || 0,
            adminData.settlement_amount || 0,
            adminData.settlement_amount_available || 0,
            adminData.divide_rate || 0,
            adminData.platform_coins || 0,
            adminData.available_platform_coins || 0,
            adminData.tg_account || '', 
            adminData.qq_account || '', 
            adminData.email || '', 
            adminData.phone || '',
            adminData.is_active !== undefined ? (adminData.is_active ? 1 : 0) : 1,
            JSON.stringify(adminData.allowed_channel_codes || []),
            JSON.stringify(adminData.allowed_game_ids || [])
        ],
    });
    return result;
}

export const updateAdmin = async (id: number, adminData: Partial<Omit<Admin, 'id' | 'created_at' | 'updated_at'>>) => {
    const fields = [];
    const values = [];
    
    if (adminData.level !== undefined) {
        fields.push('level = ?');
        values.push(adminData.level);
    }
    if (adminData.name !== undefined) {
        fields.push('name = ?');
        values.push(adminData.name);
    }
    if (adminData.password !== undefined) {
        fields.push('password = ?');
        values.push(adminData.password);
    }
    if (adminData.channel_code !== undefined) {
        fields.push('channel_code = ?');
        values.push(adminData.channel_code);
    }
    if (adminData.settlement_type !== undefined) {
        fields.push('settlement_type = ?');
        values.push(adminData.settlement_type);
    }
    if (adminData.settlement_amount !== undefined) {
        fields.push('settlement_amount = ?');
        values.push(adminData.settlement_amount);
    }
    if (adminData.settlement_amount_available !== undefined) {
        fields.push('settlement_amount_available = ?');
        values.push(adminData.settlement_amount_available);
    }
    if (adminData.divide_rate !== undefined) {
        fields.push('divide_rate = ?');
        values.push(adminData.divide_rate);
    }
    if (adminData.platform_coins !== undefined) {
        fields.push('platform_coins = ?');
        values.push(adminData.platform_coins);
    }
    if (adminData.available_platform_coins !== undefined) {
        fields.push('available_platform_coins = ?');
        values.push(adminData.available_platform_coins);
    }
    if (adminData.tg_account !== undefined) {
        fields.push('tg_account = ?');
        values.push(adminData.tg_account);
    }
    if (adminData.qq_account !== undefined) {
        fields.push('qq_account = ?');
        values.push(adminData.qq_account);
    }
    if (adminData.email !== undefined) {
        fields.push('email = ?');
        values.push(adminData.email);
    }
    if (adminData.phone !== undefined) {
        fields.push('phone = ?');
        values.push(adminData.phone);
    }
    if (adminData.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(adminData.is_active ? 1 : 0);
    }
    if (adminData.allowed_channel_codes !== undefined) {
        fields.push('allowed_channel_codes = ?');
        values.push(JSON.stringify(adminData.allowed_channel_codes));
    }
    if (adminData.allowed_game_ids !== undefined) {
        fields.push('allowed_game_ids = ?');
        values.push(JSON.stringify(adminData.allowed_game_ids));
    }
    
    if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id);
        
        await sql({
            query: `UPDATE Admins SET ${fields.join(', ')} WHERE id = ?`,
            values: values,
        });
    }
}

// 获取管理员详细信息（包含权限）
export const getAdminWithPermissions = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM Admins WHERE id = ?',
        values: [id],
    }) as any;
    
    if (result.length === 1) {
        const admin = result[0] as Admin;
        
        try {
            // 解析allowed_channel_codes
            if (admin.allowed_channel_codes) {
                if (typeof admin.allowed_channel_codes === 'string') {
                    admin.allowed_channel_codes = JSON.parse(admin.allowed_channel_codes);
                } else if (!Array.isArray(admin.allowed_channel_codes)) {
                    admin.allowed_channel_codes = [];
                }
            } else {
                admin.allowed_channel_codes = [];
            }
            
            // 解析allowed_game_ids
            if (admin.allowed_game_ids) {
                if (typeof admin.allowed_game_ids === 'string') {
                    admin.allowed_game_ids = JSON.parse(admin.allowed_game_ids);
                } else if (!Array.isArray(admin.allowed_game_ids)) {
                    admin.allowed_game_ids = [];
                }
            } else {
                admin.allowed_game_ids = [];
            }
        } catch (error) {
            console.error(`JSON解析失败 - 管理员 ${admin.name}: ${error}`);
            admin.allowed_channel_codes = [];
            admin.allowed_game_ids = [];
        }
        
        return admin;
    }
    return null;
}

// 更新管理员的权限（channelCodes）
export const updateChannelCodes = async (id: number, channelCodes: string[]) => {
    await sql({
        query: 'UPDATE Admins SET allowed_channel_codes = ?, updated_at = NOW() WHERE id = ?',
        values: [JSON.stringify(channelCodes), id],
    });
}

// 计算并刷新管理员权限（基于AgentRelationships表）
export const refreshAdminPermissions = async (adminId: number) => {
    try {
        const admin = await getAdminWithPermissions(adminId);
        
        if (!admin) {
            throw new Error('管理员不存在');
        }

        let channelCodes: string[] = [];
        
        if (admin.level === 0) {
            // 超级管理员可以访问所有数据
            channelCodes = [];
        } else {
            // 代理用户需要查询权限范围
            // 1. 添加自己的channel_code
            if (admin.channel_code) {
                channelCodes.push(admin.channel_code);
            }
            
            // 2. 查询所有下级代理的channel_code（基于渠道代码关系）
            if (admin.channel_code) {
                const AgentRelationships = await import('./agentRelationships');
                const childChannelCodes = await AgentRelationships.getAllChildChannelCodes(admin.channel_code);
                
                for (const childChannelCode of childChannelCodes) {
                    if (!channelCodes.includes(childChannelCode)) {
                        channelCodes.push(childChannelCode);
                    }
                }
            }
        }
        
        // 更新到数据库
        await updateChannelCodes(adminId, channelCodes);
        
        return channelCodes;
    } catch (error) {
        console.error('刷新管理员权限失败:', error);
        throw error;
    }
}

// 批量刷新所有管理员权限
export const refreshAllAdminPermissions = async () => {
    try {
        const admins = await read();
        
        for (const admin of admins) {
            await refreshAdminPermissions(admin.id);
        }
        
        console.log('所有管理员权限刷新完成');
    } catch (error) {
        console.error('批量刷新权限失败:', error);
        throw error;
    }
}

// 向上级联刷新权限（当创建新下级代理时，需要更新所有上级代理的权限）
export const cascadeRefreshUpwardPermissions = async (channelCode: string) => {
    try {
        const AgentRelationships = await import('./agentRelationships');
        const allAdmins = await read();
        
        // 创建渠道代码到管理员的映射
        const channelToAdmin = new Map<string, Admin>();
        allAdmins.forEach(admin => {
            if (admin.channel_code) {
                channelToAdmin.set(admin.channel_code, admin);
            }
        });
        
        let currentChannelCode: string | null = channelCode;
        const visitedChannels = new Set<string>(); // 防止无限循环
        const maxDepth = 10; // 最大递归深度
        let depth = 0;
        
        // 向上递归刷新所有上级代理的权限
        while (currentChannelCode && depth < maxDepth) {
            // 检查是否已经访问过此渠道（防止循环）
            if (visitedChannels.has(currentChannelCode)) {
                console.log(`检测到循环引用，停止级联刷新: ${currentChannelCode}`);
                break;
            }
            visitedChannels.add(currentChannelCode);
            
            // 获取上级渠道代码
            const parentChannelCode = await AgentRelationships.getParentChannelCode(currentChannelCode);
            
            if (parentChannelCode) {
                // 找到上级管理员
                const parentAdmin = channelToAdmin.get(parentChannelCode);
                if (parentAdmin) {
                    console.log(`向上级联刷新权限: ${parentAdmin.name} (${parentChannelCode}), 深度: ${depth + 1}`);
                    await refreshAdminPermissions(parentAdmin.id);
                } else {
                    console.log(`未找到渠道代码对应的管理员: ${parentChannelCode}`);
                }
            }
            
            // 继续向上查找
            currentChannelCode = parentChannelCode;
            depth++;
        }
        
        if (depth >= maxDepth) {
            console.log(`向上级联刷新权限达到最大深度限制: ${maxDepth}`);
        }
        
        console.log(`向上级联刷新权限完成，起始渠道: ${channelCode}, 处理深度: ${depth}`);
    } catch (error) {
        console.error('向上级联刷新权限失败:', error);
        // 级联权限刷新失败不应该阻止代理创建
        console.log('级联权限刷新失败，但继续执行后续逻辑');
    }
}

// 更新管理员的游戏权限
export const updateGameIds = async (id: number, gameIds: number[]) => {
    await sql({
        query: 'UPDATE Admins SET allowed_game_ids = ?, updated_at = NOW() WHERE id = ?',
        values: [JSON.stringify(gameIds), id],
    });
}

// 切换管理员状态
export const toggleAdminStatus = async (id: number, isActive: boolean) => {
    await sql({
        query: 'UPDATE Admins SET is_active = ?, updated_at = NOW() WHERE id = ?',
        values: [isActive ? 1 : 0, id],
    });
}

// 获取所有可用的游戏列表
export const getAllGames = async () => {
    const games = await sql({
        query: 'SELECT id, game_name, game_code, icon_url, supported_devices, register_url, ios_download_url, android_download_url, description, is_active FROM Games ORDER BY id',
    });
    return games as Array<{
        id: number,
        game_name: string,
        game_code: string,
        icon_url: string,
        supported_devices: string,
        register_url: string,
        ios_download_url: string,
        android_download_url: string,
        description: string,
        is_active: number
    }>;
}

// 检查管理员是否有访问指定游戏的权限
export const hasGamePermission = async (adminId: number, gameId: number): Promise<boolean> => {
    const admin = await getAdminWithPermissions(adminId);
    
    if (!admin) {
        return false;
    }
    
    // 超级管理员可以访问所有游戏
    if (admin.level === 0) {
        return true;
    }
    
    // 检查游戏权限列表
    if (!admin.allowed_game_ids || admin.allowed_game_ids.length === 0) {
        return false;
    }
    
    return admin.allowed_game_ids.includes(gameId);
}

// 检查管理员是否可以编辑游戏权限（只有level 0和1可以）
export const canEditGamePermissions = async (adminId: number): Promise<boolean> => {
    const admin = await getAdminWithPermissions(adminId);
    return admin ? (admin.level === 0 || admin.level === 1) : false;
}

// 获取管理员可以管理的下级管理员列表
export const getManageableAdmins = async (adminId: number) => {
    const admin = await getAdminWithPermissions(adminId);
    
    if (!admin) {
        return [];
    }
    
    // 超级管理员(level 0)可以管理所有代理
    if (admin.level === 0) {
        const allAdmins = await read();
        return allAdmins.filter(a => a.level > 0 && a.id !== adminId);
    }
    
    // 其他级别：只能管理AgentRelationships表中的直接下级
    if (!admin.channel_code) {
        return [];
    }
    
    try {
        const AgentRelationships = await import('./agentRelationships');
        const childChannelCodes = await AgentRelationships.getDirectChildChannelCodes(admin.channel_code);
        
        if (childChannelCodes.length === 0) {
            return [];
        }
        
        const allAdmins = await read();
        return allAdmins.filter(a => 
            a.channel_code && childChannelCodes.includes(a.channel_code) && a.id !== adminId
        );
    } catch (error) {
        console.error('获取可管理代理失败:', error);
        return [];
    }
}

// 根据管理员权限过滤游戏列表
export const getFilteredGames = async (adminId: number) => {
    const admin = await getAdminWithPermissions(adminId);
    const allGames = await getAllGames();
    
    if (!admin) {
        return [];
    }
    
    // 超级管理员可以看到所有游戏
    if (admin.level === 0) {
        return allGames;
    }
    
    // 根据权限过滤游戏
    if (!admin.allowed_game_ids || admin.allowed_game_ids.length === 0) {
        return [];
    }
    
    return allGames.filter(game => admin.allowed_game_ids!.includes(game.id));
}

// 级联更新下级代理的游戏权限（使用传入的新权限，避免数据库延迟问题）
export const cascadeUpdateGamePermissionsWithNewPermissions = async (adminId: number, newGameIds: number[], removedGameIds: number[] = []) => {
    const admin = await getAdminWithPermissions(adminId);
    
    if (!admin) {
        return;
    }
    
    // 使用传入的新权限，而不是从数据库获取的权限
    admin.allowed_game_ids = newGameIds;
    
    try {
        const AgentRelationships = await import('./agentRelationships');
        let allChildChannelCodes: string[] = [];
        
        if (admin.level === 0) {
            // 超级管理员影响所有代理
            const allAdmins = await read();
            allChildChannelCodes = allAdmins
                .filter(a => a.level > 0 && a.channel_code && a.id !== adminId)
                .map(a => a.channel_code!);
        } else if (admin.channel_code) {
            // 其他级别的代理影响AgentRelationships表中的所有下级
            allChildChannelCodes = await AgentRelationships.getAllChildChannelCodes(admin.channel_code);
        }
        
        if (allChildChannelCodes.length === 0) {
            return;
        }
        
        const allAdmins = await read();
        const childAdmins = allAdmins.filter(a => 
            a.channel_code && allChildChannelCodes.includes(a.channel_code)
        );
        
        // 更新每个下级代理的权限
        for (const childAdmin of childAdmins) {
            const childWithPermissions = await getAdminWithPermissions(childAdmin.id);
            if (!childWithPermissions) {
                continue;
            }
            
            let currentGameIds = childWithPermissions.allowed_game_ids || [];
            const originalGameIds = [...currentGameIds];
            
            // 移除被删除的游戏ID
            if (removedGameIds.length > 0) {
                currentGameIds = currentGameIds.filter(gameId => !removedGameIds.includes(gameId));
            }
            
            // 确保下级的游戏权限不超出上级的范围
            const parentGameIds = admin.allowed_game_ids || [];
            
            if (admin.level >= 0) { // 所有级别都需要限制权限范围
                currentGameIds = currentGameIds.filter(gameId => parentGameIds.includes(gameId));
            }
            
            // 检查是否有变化
            const hasChanged = JSON.stringify(originalGameIds.sort()) !== JSON.stringify(currentGameIds.sort());
            
            if (hasChanged) {
                // 更新下级权限
                await updateGameIds(childAdmin.id, currentGameIds);
                console.log(`级联更新: ${childAdmin.name} (${childAdmin.channel_code}) 权限从 [${originalGameIds.join(',')}] 更新为 [${currentGameIds.join(',')}]`);
            } else {
                console.log(`级联更新: ${childAdmin.name} (${childAdmin.channel_code}) 权限无变化 [${originalGameIds.join(',')}]`);
            }
        }
    } catch (error) {
        console.error('级联更新游戏权限失败:', error);
    }
}

// 级联更新下级代理的游戏权限（基于AgentRelationships表的实际关系）
export const cascadeUpdateGamePermissions = async (adminId: number, removedGameIds: number[] = []) => {
    const admin = await getAdminWithPermissions(adminId);
    
    if (!admin) {
        console.log('级联更新失败：找不到管理员');
        return;
    }
    
    console.log(`开始级联更新 - 上级: ${admin.name} (${admin.channel_code}, Level: ${admin.level})`);
    console.log(`上级当前游戏权限: [${admin.allowed_game_ids?.join(', ') || ''}]`);
    console.log(`需要移除的游戏: [${removedGameIds.join(', ')}]`);
    
    try {
        const AgentRelationships = await import('./agentRelationships');
        let allChildChannelCodes: string[] = [];
        
        if (admin.level === 0) {
            // 超级管理员影响所有代理
            const allAdmins = await read();
            allChildChannelCodes = allAdmins
                .filter(a => a.level > 0 && a.channel_code && a.id !== adminId)
                .map(a => a.channel_code!);
            console.log(`超级管理员模式 - 影响所有代理: [${allChildChannelCodes.join(', ')}]`);
        } else if (admin.channel_code) {
            // 其他级别的代理影响AgentRelationships表中的所有下级
            allChildChannelCodes = await AgentRelationships.getAllChildChannelCodes(admin.channel_code);
            console.log(`普通代理模式 - 查找 ${admin.channel_code} 的所有下级: [${allChildChannelCodes.join(', ')}]`);
        }
        
        if (allChildChannelCodes.length === 0) {
            console.log('没有找到下级代理，级联更新结束');
            return;
        }
        
        const allAdmins = await read();
        const childAdmins = allAdmins.filter(a => 
            a.channel_code && allChildChannelCodes.includes(a.channel_code)
        );
        
        console.log(`找到 ${childAdmins.length} 个下级代理需要更新`);
        
        // 更新每个下级代理的权限
        for (const childAdmin of childAdmins) {
            console.log(`\n处理下级代理: ${childAdmin.name} (${childAdmin.channel_code}, Level: ${childAdmin.level})`);
            
            const childWithPermissions = await getAdminWithPermissions(childAdmin.id);
            if (!childWithPermissions) {
                console.log(`跳过 - 无法获取权限信息`);
                continue;
            }
            
            let currentGameIds = childWithPermissions.allowed_game_ids || [];
            const originalGameIds = [...currentGameIds];
            console.log(`下级原始权限: [${originalGameIds.join(', ')}]`);
            
            // 移除被删除的游戏ID
            if (removedGameIds.length > 0) {
                currentGameIds = currentGameIds.filter(gameId => !removedGameIds.includes(gameId));
                console.log(`移除被删除游戏后: [${currentGameIds.join(', ')}]`);
            }
            
            // 确保下级的游戏权限不超出上级的范围
            const parentGameIds = admin.allowed_game_ids || [];
            if (admin.level >= 0) { // 所有级别都需要限制权限范围
                const beforeFilter = [...currentGameIds];
                currentGameIds = currentGameIds.filter(gameId => parentGameIds.includes(gameId));
                console.log(`上级权限限制前: [${beforeFilter.join(', ')}]`);
                console.log(`上级权限限制后: [${currentGameIds.join(', ')}]`);
            }
            
            // 检查是否有变化
            const hasChanged = JSON.stringify(originalGameIds.sort()) !== JSON.stringify(currentGameIds.sort());
            console.log(`权限是否有变化: ${hasChanged}`);
            
            if (hasChanged) {
                // 更新下级权限
                await updateGameIds(childAdmin.id, currentGameIds);
                console.log(`✓ 已更新: ${childAdmin.name} (${childAdmin.channel_code}) 的游戏权限`);
            } else {
                console.log(`- 无需更新: ${childAdmin.name} (${childAdmin.channel_code}) 的游戏权限`);
            }
        }
        
        console.log(`级联更新完成 - 共处理 ${childAdmins.length} 个下级代理`);
    } catch (error) {
        console.error('级联更新游戏权限失败:', error);
    }
}

// 删除游戏时的全局权限清理
export const removeGameFromAllAdmins = async (gameId: number) => {
    const allAdmins = await read();
    
    for (const admin of allAdmins) {
        const adminWithPermissions = await getAdminWithPermissions(admin.id);
        if (!adminWithPermissions || !adminWithPermissions.allowed_game_ids) continue;
        
        if (adminWithPermissions.allowed_game_ids.includes(gameId)) {
            const updatedGameIds = adminWithPermissions.allowed_game_ids.filter(id => id !== gameId);
            await updateGameIds(admin.id, updatedGameIds);
            console.log(`从 ${admin.name} (Level ${admin.level}) 移除游戏权限: ${gameId}`);
        }
    }
}

// 批量同步所有代理的游戏权限（基于AgentRelationships表确保权限不超出上级范围）
export const syncAllGamePermissions = async () => {
    console.log('开始同步所有代理的游戏权限...');
    
    try {
        const AgentRelationships = await import('./agentRelationships');
        const allAdmins = await read();
        const allRelationships = await AgentRelationships.read();
        
        // 创建渠道代码到管理员的映射
        const channelToAdmin = new Map<string, typeof allAdmins[0]>();
        allAdmins.forEach(admin => {
            if (admin.channel_code) {
                channelToAdmin.set(admin.channel_code, admin);
            }
        });
        
        // 为每个有渠道代码的代理同步权限
        for (const admin of allAdmins) {
            if (!admin.channel_code || admin.level === 0) {
                // 超级管理员跳过，没有渠道代码的也跳过
                continue;
            }
            
            const adminWithPermissions = await getAdminWithPermissions(admin.id);
            if (!adminWithPermissions) continue;
            
            let currentGameIds = adminWithPermissions.allowed_game_ids || [];
            
            // 获取上级渠道代码
            const parentChannelCode = await AgentRelationships.getParentChannelCode(admin.channel_code);
            
            if (parentChannelCode) {
                // 找到上级管理员
                const parentAdmin = channelToAdmin.get(parentChannelCode);
                if (parentAdmin) {
                    const parentWithPermissions = await getAdminWithPermissions(parentAdmin.id);
                    if (parentWithPermissions) {
                        const parentGameIds = parentWithPermissions.allowed_game_ids || [];
                        
                        if (parentAdmin.level > 0 && parentGameIds.length > 0) {
                            // 非超级管理员的下级权限不能超出上级
                            const originalLength = currentGameIds.length;
                            currentGameIds = currentGameIds.filter(gameId => parentGameIds.includes(gameId));
                            
                            if (originalLength !== currentGameIds.length) {
                                await updateGameIds(admin.id, currentGameIds);
                                console.log(`同步代理 ${admin.name} (${admin.channel_code}) 的游戏权限，受上级 ${parentAdmin.name} (${parentChannelCode}) 限制`);
                            }
                        }
                    }
                }
            } else {
                // 没有上级的代理，检查是否受超级管理员限制
                const superAdmins = allAdmins.filter(a => a.level === 0);
                if (superAdmins.length > 0) {
                    // 如果有超级管理员，则不限制（超级管理员的allowed_game_ids为空表示全部权限）
                    console.log(`代理 ${admin.name} (${admin.channel_code}) 权限保持不变，无直接上级`);
                }
            }
        }
        
        console.log('所有代理的游戏权限同步完成');
    } catch (error) {
        console.error('同步所有游戏权限失败:', error);
        throw error;
    }
}

// 更新管理员密码（用于API调用）
export const updateAdminPassword = async (adminId: number, newPassword: string): Promise<boolean> => {
    try {
        await sql({
            query: 'UPDATE Admins SET password = ?, updated_at = NOW() WHERE id = ?',
            values: [newPassword, adminId],
        });
        return true;
    } catch (error) {
        console.error('更新管理员密码失败:', error);
        return false;
    }
}

// 更新管理员个人信息（QQ和TG账号）
export const updateProfile = async (adminId: number, profileData: {qq_account?: string, tg_account?: string}): Promise<boolean> => {
    try {
        const fields = [];
        const values = [];
        
        if (profileData.qq_account !== undefined) {
            fields.push('qq_account = ?');
            values.push(profileData.qq_account);
        }
        
        if (profileData.tg_account !== undefined) {
            fields.push('tg_account = ?');
            values.push(profileData.tg_account);
        }
        
        if (fields.length > 0) {
            fields.push('updated_at = NOW()');
            values.push(adminId);
            
            await sql({
                query: `UPDATE Admins SET ${fields.join(', ')} WHERE id = ?`,
                values: values,
            });
        }
        
        return true;
    } catch (error) {
        console.error('更新管理员个人信息失败:', error);
        return false;
    }
}

// 获取管理员个人信息
export const getAdminProfile = async (adminId: number) => {
    try {
        const result = await sql({
            query: 'SELECT id, level, name, channel_code, created_at, updated_at, settlement_type, settlement_amount, settlement_amount_available, divide_rate, tg_account, qq_account, email, phone, allowed_channel_codes, allowed_game_ids FROM Admins WHERE id = ?',
            values: [adminId],
        }) as any;
        
        if (result.length === 1) {
            const admin = result[0] as Admin;
            // 解析JSON字段
            try {
                if (admin.allowed_channel_codes && typeof admin.allowed_channel_codes === 'string') {
                    admin.allowed_channel_codes = JSON.parse(admin.allowed_channel_codes);
                } else {
                    admin.allowed_channel_codes = [];
                }
                
                if (admin.allowed_game_ids && typeof admin.allowed_game_ids === 'string') {
                    admin.allowed_game_ids = JSON.parse(admin.allowed_game_ids);
                } else {
                    admin.allowed_game_ids = [];
                }
            } catch {
                admin.allowed_channel_codes = [];
                admin.allowed_game_ids = [];
            }
            return admin;
        }
        return null;
    } catch (error) {
        console.error('获取管理员个人信息失败:', error);
        return null;
    }
}
