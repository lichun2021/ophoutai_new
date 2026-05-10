/**
 * op-admin 内部接口调用客户端
 * 内网通过 3003 端口直连，使用与 op-admin 共享的 API_SIGN_KEY 做认证
 */

const OP_ADMIN_BASE_URL = process.env.OP_ADMIN_INTERNAL_URL || 'http://localhost:3003';
// 与 op-admin 共用同一个 key（环境变量 API_SIGN_KEY）
const SHARED_KEY = process.env.API_SIGN_KEY || 'q12eiedu24fi3rf434g34g';

/**
 * 将创建代理请求原样转发给 op-admin 内部接口
 */
export async function syncCreatePromoterToOpAdmin(
    body: Record<string, any>
): Promise<{ success: boolean; message: string; data?: any }> {
    try {
        const url = `${OP_ADMIN_BASE_URL}/api/internal/admin/create-promoter`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': SHARED_KEY,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        const result = await response.json() as any;
        if (!response.ok) {
            console.error('[opAdminClient] 同步创建代理失败:', result);
            return { success: false, message: result?.message || `HTTP ${response.status}` };
        }
        return { success: true, message: '同步成功', data: result?.data };
    } catch (err: any) {
        console.error('[opAdminClient] 调用 op-admin 创建代理接口异常:', err?.message || err);
        return { success: false, message: err?.message || '网络错误' };
    }
}
