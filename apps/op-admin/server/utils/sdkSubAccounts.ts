import crypto from 'node:crypto';

export type SubAccountAction = 'list' | 'create' | 'delete' | 'rename';
export class SubAccountError extends Error {}

/** Parent row lock serializes first creation, create/delete and the 10-account limit across devices. */
export async function manageSdkSubAccounts(
    pool: any,
    input: { userId: number; action: SubAccountAction; subAccountId?: string; nickname?: string },
    accessKey: string,
    now = Math.floor(Date.now() / 1000)
) {
    if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new SubAccountError('登录会话无效');
    if (!['list', 'create', 'delete', 'rename'].includes(input.action)) throw new SubAccountError('不支持的小号操作');
    const nickname = String(input.nickname ?? '').trim();
    if (nickname.length > 32) throw new SubAccountError('小号名称最多32个字符');
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [parents] = await connection.query('SELECT id, status FROM users WHERE id = ? FOR UPDATE', [input.userId]);
        if (!parents.length || Number(parents[0].status) === 1) throw new SubAccountError('账号不存在或已被封禁');
        const read = async () => {
            const [rows] = await connection.query('SELECT id, username FROM subusers WHERE parent_user_id = ? ORDER BY id ASC FOR UPDATE', [input.userId]);
            return rows as Array<{ id: number; username: string }>;
        };
        let rows = await read();
        if (!rows.length) {
            await connection.query('INSERT INTO subusers (parent_user_id, username, wuid) VALUES (?, ?, ?)', [input.userId, '默认小号', '']);
            rows = await read();
        }
        if (!rows.length) throw new Error('Default subaccount insert did not return an account');
        const defaultId = String(rows[0].id);
        if (input.action === 'create') {
            if (rows.length >= 10) throw new SubAccountError('每个账号最多10个小号（含默认小号）');
            const name = nickname || `小号_${crypto.randomBytes(4).toString('hex')}`;
            if (rows.some(row => row.username === name)) throw new SubAccountError('已有同名小号，请换一个名称');
            await connection.query('INSERT INTO subusers (parent_user_id, username, wuid) VALUES (?, ?, ?)', [input.userId, name, '']);
        } else if (input.action === 'delete' || input.action === 'rename') {
            const id = String(input.subAccountId ?? '');
            if (!/^[1-9]\d*$/.test(id) || !rows.some(row => String(row.id) === id)) throw new SubAccountError('小号不存在或不属于当前账号');
            if (input.action === 'delete') {
                if (id === defaultId) throw new SubAccountError('默认小号不可删除');
                const [pending] = await connection.query('SELECT id FROM paymentrecords WHERE sub_user_id = ? AND payment_status IN (0, 1) LIMIT 1', [id]);
                if (pending.length) throw new SubAccountError('该小号有进行中的订单，暂不能删除');
                // The existing gamecharacters foreign key cascades only character metadata; payment records are retained.
                await connection.query('DELETE FROM subusers WHERE id = ? AND parent_user_id = ?', [id, input.userId]);
            } else {
                if (!nickname) throw new SubAccountError('小号名称不能为空');
                if (rows.some(row => String(row.id) !== id && row.username === nickname)) throw new SubAccountError('已有同名小号，请换一个名称');
                await connection.query('UPDATE subusers SET username = ? WHERE id = ? AND parent_user_id = ?', [nickname, id, input.userId]);
            }
        }
        rows = await read();
        const data = rows.map(row => ({
            username: String(row.id), nickname: row.username, is_default: String(row.id) === defaultId,
            login_time: now,
            sign: crypto.createHash('md5').update(`${row.id}${now}${accessKey}`).digest('hex')
        }));
        await connection.commit();
        return { code: '1', msg: '操作成功', data, default_subaccount_id: defaultId, max_subaccounts: 10 };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
