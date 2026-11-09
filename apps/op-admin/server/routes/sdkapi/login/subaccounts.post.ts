import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { pool } from '../../../db';
import { verifyUserSession } from '../../../utils/auth';
import { verifySdkSign } from '../../../utils/sdkSign';
import { config } from '../../../config';
import { manageSdkSubAccounts, SubAccountError } from '../../../utils/sdkSubAccounts';

// A concrete route takes precedence over the legacy catch-all. Never log the session token or request body.
export default defineEventHandler(async event => {
    const body = await readBody(event);
    const fail = (message: string) => ({ code: '0', msg: message, data: [] });
    const timestamp = Number(body?.ts);
    if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 50) return fail('请求已过期');
    if (!(await verifySdkSign(event))) return fail('签名无效');
    const session = verifyUserSession(body?.sdk_session);
    if (!session.ok || !session.userId) {
        setResponseStatus(event, 401);
        return fail('登录已过期，请重新登录');
    }
    try {
        return await manageSdkSubAccounts(pool, {
            userId: session.userId, action: body.action, subAccountId: body.subaccount_id, nickname: body.nickname
        }, config.thirdPartyConfig?.accessKey || 'default_key');
    } catch (error) {
        return fail(error instanceof SubAccountError ? error.message : '小号操作失败，请稍后重试');
    }
});
