/**
 * GameServerClient — 标准化游戏服务器通信客户端
 *
 * 使用标准 REST API 命名规范：扁平 JSON、camelCase 字段，HMAC-SHA256 签名。
 * 第三方游戏服务器只需实现 REST 协议即可接入。
 */

import { createHmac } from 'node:crypto';

// ==================== 类型定义 ====================

export type Platform = 'android' | 'ios';

/** 客户端配置 */
export interface GameServerClientOptions {
  /** 游戏服基础地址，如 http://1.2.3.4:8888 */
  baseURL: string;
  /** 请求超时(ms)，默认 10000 */
  timeoutMs?: number;
  /** 签名密钥 */
  signKey?: string;
}

/** 标准响应格式 */
export interface GameServerResponse<T = any> {
  code: number;       // 0=成功, 非0=失败
  message: string;    // 结果描述
  data?: T;           // 业务数据
}

// ==================== 请求参数类型 ====================

export interface BanPlayerParams {
  openId: string;
  serverId: string;
  platform: Platform;
  /** 封禁时长（秒），0=永封 */
  duration: number;
  /** 封禁原因 */
  reason: string;
}

export interface UnbanPlayerParams {
  openId: string;
  serverId: string;
  platform: Platform;
}

export interface MutePlayerParams {
  openId: string;
  serverId: string;
  platform: Platform;
  /** 禁言时长（秒），0=永禁 */
  duration: number;
  /** 禁言原因 */
  reason: string;
}

export interface UnmutePlayerParams {
  openId: string;
  serverId: string;
  platform: Platform;
}

export interface SendItemMailParams {
  openId: string;
  serverId: string;
  platform: Platform;
  roleId?: string;
  /** 幂等序列号（平台自动生成） */
  serialNo?: string;
  mailTitle: string;
  mailContent: string;
  items: Array<{ itemId: number; itemCount: number }>;
}

export interface SendTextMailParams {
  openId: string;
  serverId: string;
  platform: Platform;
  roleId?: string;
  serialNo?: string;
  title: string;
  content: string;
}



export interface PlatformTransferParams {
  openId: string;
  serverId: string;
  /** 目标大区ID：1=安卓区, 2=iOS区 */
  targetAreaId: 1 | 2;
}

export interface ServerStatusParams {
  serverId: string;
  /** 大区ID */
  areaId?: number;
}

export interface ServerStatusResponse {
  registerCount: number;
  onlineCount: number;
  onlineAndroid: number;
  onlineIOS: number;
  serverName?: string;
}

export interface DeliverOrderParams {
  playerId: string;
  /** 充值类型 */
  rechargeType?: string;
  /** 计费点ID */
  goodsId: string;
  /** 商户订单号（幂等） */
  billNo: string;
}

export interface PaymentNotifyParams {
  transactionId: string;
  uid: string;
  port?: string;
}

export interface ProtectShieldParams {
  playerId: string;
}

export interface DeletePlayerParams {
  playerId: string;
}

// ==================== 端点映射 ====================

/** 新标准 REST 端点 */
const REST_ENDPOINTS = {
  banPlayer: '/open_api/player/ban',
  unbanPlayer: '/open_api/player/unban',
  mutePlayer: '/open_api/player/mute',
  unmutePlayer: '/open_api/player/unmute',
  sendItemMail: '/open_api/mail/send-with-items',
  sendTextMail: '/open_api/mail/send-text',
  platformTransfer: '/open_api/player/platform-transfer',
  serverStatus: '/open_api/server/status',
  deliverOrder: '/open_api/order/deliver',
  paymentNotify: '/open_api/order/payment-notify',
  protectShield: '/open_api/player/protect-shield',
  deletePlayer: '/open_api/player/delete',
} as const;

// ==================== 工具函数 ====================

function genSerial(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/** 生成随机 nonce */
function genNonce(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 12)}`;
}

/**
 * HMAC-SHA256 签名（使用 Node.js crypto）
 * 签名算法：HMAC-SHA256(timestamp + "\n" + nonce + "\n" + body, signKey)
 */
function hmacSign(timestamp: string, nonce: string, body: string, signKey: string): string {
  const payload = `${timestamp}\n${nonce}\n${body}`;
  return createHmac('sha256', signKey).update(payload).digest('hex');
}

// ==================== 客户端类 ====================

export class GameServerClient {
  private baseURL: string;
  private timeoutMs: number;
  private signKey: string;

  constructor(opts: GameServerClientOptions) {
    this.baseURL = opts.baseURL.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.signKey = opts.signKey ?? process.env.API_SIGN_KEY ?? '';
  }

  // ===== 端点解析 =====

  private getEndpoint(key: keyof typeof REST_ENDPOINTS): string {
    return REST_ENDPOINTS[key];
  }

  private buildUrl(key: keyof typeof REST_ENDPOINTS): string {
    return `${this.baseURL}${this.getEndpoint(key)}`;
  }

  // ===== 通用请求 =====

  private async request<T = any>(
    key: keyof typeof REST_ENDPOINTS,
    body: any,
    options?: { method?: string }
  ): Promise<GameServerResponse<T>> {
    const url = this.buildUrl(key);
    const method = options?.method ?? 'POST';

    console.log(`[GameServer] ${method} ${url}`);
    console.log(`[GameServer] 请求参数:`, JSON.stringify(body, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const bodyStr = method !== 'GET' ? JSON.stringify(body) : '';

      // 自动添加签名 Header
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.signKey) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = genNonce();
        const sign = hmacSign(timestamp, nonce, bodyStr, this.signKey);
        headers['X-Timestamp'] = timestamp;
        headers['X-Nonce'] = nonce;
        headers['X-Sign'] = sign;
        console.log(`[GameServer] 签名: ts=${timestamp}, nonce=${nonce}, sign=${sign.substring(0, 16)}...`);
      }

      const fetchOpts: RequestInit = {
        method,
        headers,
        body: method !== 'GET' ? bodyStr : undefined,
        signal: controller.signal,
      };

      const response = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);

      console.log(`[GameServer] HTTP ${response.status} ${response.statusText}`);

      const responseText = await response.text();
      console.log(`[GameServer] 响应内容:`, responseText.length > 2000 ? responseText.slice(0, 2000) + '...(截断)' : responseText);
      console.log(`[GameServer] ==========================================`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!responseText.trim()) {
        throw new Error(`[GameServer] ${key} 响应体为空 (HTTP ${response.status})`);
      }
      const data = JSON.parse(responseText);
      return this.normalizeResponse<T>(key, data);

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`[GameServer] ${key} 请求超时 (${this.timeoutMs}ms)`);
      }
      throw error;
    }
  }

  /** 统一响应格式：REST 响应 { code: 0, message: "ok", data: {...} } */
  private normalizeResponse<T>(key: string, raw: any): GameServerResponse<T> {
    if (raw.code !== 0 && raw.code !== 200) {
      throw new Error(`游戏服 ${key} 失败: [${raw.code}] ${raw.message || ''}`);
    }
    return raw as GameServerResponse<T>;
  }

  // ==================== 业务方法 ====================

  /** 封号 */
  async banPlayer(params: BanPlayerParams): Promise<GameServerResponse> {
    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
      duration: params.duration,
      reason: params.reason,
    };

    return this.request('banPlayer', body);
  }

  /** 解封 */
  async unbanPlayer(params: UnbanPlayerParams): Promise<GameServerResponse> {
    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
    };

    return this.request('unbanPlayer', body);
  }

  /** 禁言 */
  async mutePlayer(params: MutePlayerParams): Promise<GameServerResponse> {
    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
      duration: params.duration,
      reason: params.reason,
    };

    return this.request('mutePlayer', body);
  }

  /** 解禁言 */
  async unmutePlayer(params: UnmutePlayerParams): Promise<GameServerResponse> {
    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
    };

    return this.request('unmutePlayer', body);
  }

  /** 发物资邮件（带物品附件） */
  async sendItemMail(params: SendItemMailParams): Promise<GameServerResponse> {
    const serial = params.serialNo || genSerial();

    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
      roleId: params.roleId || '',
      serialNo: serial,
      mailTitle: params.mailTitle,
      mailContent: params.mailContent,
      items: params.items,
    };

    return this.request('sendItemMail', body);
  }

  /** 发文本邮件（纯文字，无物品） */
  async sendTextMail(params: SendTextMailParams): Promise<GameServerResponse> {
    const serial = params.serialNo || genSerial();

    const body = {
      openId: params.openId,
      serverId: params.serverId,
      platform: params.platform,
      roleId: params.roleId || '',
      serialNo: serial,
      title: params.title,
      content: params.content,
    };

    return this.request('sendTextMail', body);
  }



  /** 平台迁移（安卓↔iOS） */
  async platformTransfer(params: PlatformTransferParams): Promise<GameServerResponse> {
    const body = {
      openId: params.openId,
      serverId: params.serverId,
      targetAreaId: params.targetAreaId,
    };

    return this.request('platformTransfer', body);
  }

  /** 查询服务器状态（在线人数、注册数） */
  async getServerStatus(params: ServerStatusParams): Promise<GameServerResponse<ServerStatusResponse>> {
    const areaId = params.areaId ?? Number(params.serverId);

    const resp = await this.request<ServerStatusResponse>('serverStatus', {
      serverId: params.serverId,
      areaId,
    });
    return resp;
  }

  /** 计费点到账 / 订单发货 */
  async deliverOrder(params: DeliverOrderParams): Promise<GameServerResponse> {
    return this.request('deliverOrder', params);
  }

  /** 支付到账通知 */
  async paymentNotify(params: PaymentNotifyParams): Promise<GameServerResponse> {
    return this.request('paymentNotify', params);
  }

  /** 开罩子 */
  async protectShield(params: ProtectShieldParams): Promise<GameServerResponse> {
    return this.request('protectShield', params);
  }

  /** 删除角色 */
  async deletePlayer(params: DeletePlayerParams): Promise<GameServerResponse> {
    return this.request('deletePlayer', params);
  }
}

// ==================== 工厂函数 ====================

/**
 * 根据游戏服务器配置创建客户端实例
 *
 * @param webhost   游戏服基础地址
 * @param timeoutMs 请求超时(ms)
 * @param signKey   签名密钥
 */
export function createGameServerClient(
  webhost: string,
  timeoutMs?: number,
  signKey?: string,
): GameServerClient {
  return new GameServerClient({
    baseURL: webhost,
    timeoutMs: timeoutMs ?? parseInt(process.env.GM_TIMEOUT_MS || '20000'),
    signKey: signKey ?? process.env.API_SIGN_KEY ?? '',
  });
}
