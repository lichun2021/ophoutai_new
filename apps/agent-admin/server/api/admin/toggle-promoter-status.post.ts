import { defineEventHandler, proxyRequest } from 'h3';

/**
 * 代理到 op-admin：切换代理状态
 * 此接口由 op-admin 统一维护，agent-admin 直接转发请求
 * 目标地址通过环境变量 OP_ADMIN_URL 配置，默认 http://localhost:3003
 */
export default defineEventHandler((event) => {
  const opAdminUrl = (process.env.OP_ADMIN_URL || 'http://localhost:3003').replace(/\/$/, '');
  return proxyRequest(event, `${opAdminUrl}/api/admin/toggle-promoter-status`);
});
