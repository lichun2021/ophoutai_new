/**
 * GameServerClient — 标准化游戏服务器通信客户端
 *
 * 替代旧版 IdipClient，使用标准 REST API 命名规范。
 * 支持两种协议模式：
 *   - rest  (默认): 新标准接口，扁平 JSON，camelCase 字段
 *   - idip  (兼容): 旧 IDIP 协议，head/body 嵌套，数字命令ID
 *
 * 第三方游戏服务器只需实现 rest 协议即可接入。
 */

// ==================== 类型定义 ====================

export type Platform = 'android' | 'ios';

/** 协议模式 */
export type ProtocolMode = 'rest' | 'idip';

/** 客户端配置 */
export interface GameServerClientOptions {
  /** 游戏服基础地址，如 http://1.2.3.4:8888 */
  baseURL: string;
  /** 协议模式：rest=新标准 / idip=旧兼容 */
  protocol?: ProtocolMode;
  /** 请求超时(ms)，默认 10000 */
  timeoutMs?: number;
  /** 签名密钥（REST 模式必填，IDIP 模式不需要） */
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

export interface RechargePlayerParams {
  openId: string;
  serverId: string;
  platform: Platform;
  /** 充值钻石数量 */
  diamond: number;
  serialNo?: string;
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
  banPlayer:         '/api/player/ban',
  unbanPlayer:       '/api/player/unban',
  sendItemMail:      '/api/mail/send-with-items',
  sendTextMail:      '/api/mail/send-text',
  rechargePlayer:    '/api/player/recharge',
  platformTransfer:  '/api/player/platform-transfer',
  serverStatus:      '/api/server/status',
  deliverOrder:      '/api/order/deliver',
  paymentNotify:     '/api/order/payment-notify',
  protectShield:     '/api/player/protect-shield',
  deletePlayer:      '/api/player/delete',
} as const;

/** 旧 IDIP 端点 */
const IDIP_ENDPOINTS = {
  banPlayer:         '/script/idip/4147',
  unbanPlayer:       '/script/idip/4107',
  sendItemMail:      '/script/idip/4283',
  sendTextMail:      '/script/idip/4321',
  rechargePlayer:    '/script/idip/4443',
  platformTransfer:  '/script/idip/4493',
  serverStatus:      '/script/idip/4295',
  deliverOrder:      '/script/gmRecharge',
  paymentNotify:     '/update_pay_status',
  protectShield:     '/script/openProtectShield',
  deletePlayer:      '/script/playerDelete',
} as const;

// ==================== 工具函数 ====================

function platformToId(p: Platform): 1 | 2 {
  return p === 'ios' ? 2 : 1;
}

function genSerial(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function enc(s: string): string {
  return encodeURIComponent(s ?? '');
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
  const crypto = require('crypto');
  const payload = `${timestamp}\n${nonce}\n${body}`;
  return crypto.createHmac('sha256', signKey).update(payload).digest('hex');
}

// ==================== 客户端类 ====================

export class GameServerClient {
  private baseURL: string;
  private protocol: ProtocolMode;
  private timeoutMs: number;
  private signKey: string;

  constructor(opts: GameServerClientOptions) {
    this.baseURL = opts.baseURL.replace(/\/+$/, '');
    this.protocol = opts.protocol ?? 'rest';
    this.timeoutMs = opts.timeoutMs ?? 10000;
    this.signKey = opts.signKey ?? process.env.API_SIGN_KEY ?? '';
  }

  /** 获取当前协议模式 */
  get currentProtocol(): ProtocolMode {
    return this.protocol;
  }

  // ===== 端点解析 =====

  private getEndpoint(key: keyof typeof REST_ENDPOINTS): string {
    const endpoints = this.protocol === 'idip' ? IDIP_ENDPOINTS : REST_ENDPOINTS;
    return endpoints[key];
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

      // REST 模式：自动添加签名 Header
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.protocol === 'rest' && this.signKey) {
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
      console.log(`[GameServer] 响应:`, responseText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  /** 统一响应格式：将 IDIP 响应转换为标准格式 */
  private normalizeResponse<T>(key: string, raw: any): GameServerResponse<T> {
    if (this.protocol === 'idip') {
      // IDIP 格式: { head: {...}, body: { Result: 0, ... } }
      const result = raw?.body?.Result ?? raw?.Result ?? -9999;
      const retMsg = raw?.body?.RetMsg || raw?.head?.RetErrMsg || '';
      if (result !== 0) {
        throw new Error(`游戏服 ${key} 失败: [${result}] ${retMsg}`);
      }
      return { code: 0, message: 'ok', data: raw?.body as T };
    }
    // REST 格式: { code: 0, message: "ok", data: {...} }
    if (raw.code !== 0 && raw.code !== 200) {
      throw new Error(`游戏服 ${key} 失败: [${raw.code}] ${raw.message || ''}`);
    }
    return raw as GameServerResponse<T>;
  }

  // ===== 构建 IDIP 请求体（兼容旧协议） =====

  private wrapIdipBody(cmdId: number, body: Record<string, any>): any {
    if (this.protocol === 'idip') {
      return {
        head: {
          Cmdid: cmdId,
          Seqid: '1',
          TimeStamp: Math.floor(Date.now() / 1000),
        },
        body,
      };
    }
    // REST 模式直接返回业务参数
    return body;
  }

  // ==================== 业务方法 ====================

  /** 封号 */
  async banPlayer(params: BanPlayerParams): Promise<GameServerResponse> {
    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4147, {
          PlatId: platformToId(params.platform),
          OpenId: params.openId,
          Partition: params.serverId,
          BanTime: params.duration,
          BanReason: enc(params.reason),
        })
      : {
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
    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4107, {
          PlatId: platformToId(params.platform),
          OpenId: params.openId,
          Partition: params.serverId,
        })
      : {
          openId: params.openId,
          serverId: params.serverId,
          platform: params.platform,
        };

    return this.request('unbanPlayer', body);
  }

  /** 发物资邮件（带物品附件） */
  async sendItemMail(params: SendItemMailParams): Promise<GameServerResponse> {
    const serial = params.serialNo || genSerial();

    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4283, {
          PlatId: platformToId(params.platform),
          OpenId: params.openId,
          Partition: params.serverId,
          RoleId: params.roleId ?? '',
          Serial: serial,
          MailTitle: enc(params.mailTitle),
          MailContent: enc(params.mailContent),
          SendItemList: params.items.map(i => ({ ItemId: i.itemId, ItemNum: i.itemCount })),
        })
      : {
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

    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4321, {
          PlatId: platformToId(params.platform),
          OpenId: params.openId,
          Partition: params.serverId,
          RoleId: params.roleId ?? '',
          Serial: serial,
          Title: enc(params.title),
          Content: enc(params.content),
        })
      : {
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

  /** GM充值钻石 */
  async rechargePlayer(params: RechargePlayerParams): Promise<GameServerResponse> {
    const serial = params.serialNo || genSerial();

    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4443, {
          PlatId: platformToId(params.platform),
          OpenId: params.openId,
          Partition: params.serverId,
          Diamond: params.diamond,
          Serial: serial,
        })
      : {
          openId: params.openId,
          serverId: params.serverId,
          platform: params.platform,
          diamond: params.diamond,
          serialNo: serial,
        };

    return this.request('rechargePlayer', body);
  }

  /** 平台迁移（安卓↔iOS） */
  async platformTransfer(params: PlatformTransferParams): Promise<GameServerResponse> {
    const body = this.protocol === 'idip'
      ? this.wrapIdipBody(4493, {
          AreaId: params.targetAreaId,
          Partition: params.serverId,
          OpenId: params.openId,
        })
      : {
          openId: params.openId,
          serverId: params.serverId,
          targetAreaId: params.targetAreaId,
        };

    return this.request('platformTransfer', body);
  }

  /** 查询服务器状态（在线人数、注册数） */
  async getServerStatus(params: ServerStatusParams): Promise<GameServerResponse<ServerStatusResponse>> {
    const areaId = params.areaId ?? Number(params.serverId);
    const partition = 10000 + areaId;

    if (this.protocol === 'idip') {
      const now = new Date();
      const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
      const sendTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const body = {
        head: {
          Cmdid: 10282085,
          Seqid: 1,
          ServiceName: 'idip',
          SendTime: sendTime,
          PlatId: 1,
          AreaId: areaId,
          Partition: partition,
        },
        body: {},
      };

      const url = this.buildUrl('serverStatus');
      console.log(`[GameServer] POST ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const json = await res.json().catch(() => ({}));
        const b: any = json?.body || {};

        return {
          code: 0,
          message: 'ok',
          data: {
            registerCount: Number(b.RegisterNum || 0),
            onlineCount: Number(b.OnlineNum || 0),
            onlineAndroid: Number(b.AndroidOnlineNum || 0),
            onlineIOS: Number(b.IosOnlineNum || 0),
            serverName: (() => { try { return decodeURIComponent(b.SvrName || ''); } catch { return String(b.SvrName || ''); } })(),
          },
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new Error(`[GameServer] serverStatus 请求失败: ${err?.message || err}`);
      }
    }

    // REST 模式
    const resp = await this.request<ServerStatusResponse>('serverStatus', {
      serverId: params.serverId,
      areaId,
    });
    return resp;
  }

  /** 计费点到账 / 订单发货 */
  async deliverOrder(params: DeliverOrderParams): Promise<GameServerResponse> {
    if (this.protocol === 'idip') {
      // 旧协议走 GET /script/gmRecharge?playerId=&rechargeType=&goodsId=&billno=
      const qs = new URLSearchParams({
        playerId: params.playerId,
        ...(params.rechargeType ? { rechargeType: params.rechargeType } : {}),
        goodsId: params.goodsId,
        billno: params.billNo,
      }).toString();
      const url = `${this.buildUrl('deliverOrder')}?${qs}`;

      console.log(`[GameServer] GET ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const text = await res.text();

        // 兼容多种成功响应
        try {
          const json = JSON.parse(text);
          const ok = json.code === 0 || json.msg === 'success' ||
            (json.result && String(json.result).toLowerCase().includes('success'));
          if (ok) return { code: 0, message: 'ok', data: json };
          throw new Error(`deliverOrder 失败: ${JSON.stringify(json).substring(0, 500)}`);
        } catch (parseErr) {
          if (text.trim().toLowerCase() === 'success') {
            return { code: 0, message: 'ok' };
          }
          throw parseErr;
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new Error(`[GameServer] deliverOrder 失败: ${err?.message || err}`);
      }
    }

    // REST 模式
    return this.request('deliverOrder', params);
  }

  /** 支付到账通知 */
  async paymentNotify(params: PaymentNotifyParams): Promise<GameServerResponse> {
    if (this.protocol === 'idip') {
      // 旧协议走 POST /update_pay_status
      const url = this.buildUrl('paymentNotify');
      console.log(`[GameServer] POST ${url}`, params);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          return { code: 0, message: '通知成功' };
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err?.name === 'AbortError') {
          throw new Error('[GameServer] paymentNotify 响应超时');
        }
        throw new Error(`[GameServer] paymentNotify 失败: ${err?.message || err}`);
      }
    }

    // REST 模式
    return this.request('paymentNotify', params);
  }

  /** 开罩子 */
  async protectShield(params: ProtectShieldParams): Promise<GameServerResponse> {
    if (this.protocol === 'idip') {
      const url = `${this.buildUrl('protectShield')}?playerId=${params.playerId}`;
      console.log(`[GameServer] GET ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          return { code: json.success ? 0 : -1, message: json.message || '', data: json };
        } catch {
          return { code: -1, message: text || '响应解析失败' };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new Error(`[GameServer] protectShield 失败: ${err?.message || err}`);
      }
    }

    return this.request('protectShield', params);
  }

  /** 删除角色 */
  async deletePlayer(params: DeletePlayerParams): Promise<GameServerResponse> {
    if (this.protocol === 'idip') {
      const url = `${this.buildUrl('deletePlayer')}?playerId=${params.playerId}`;
      console.log(`[GameServer] GET ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          return { code: json.success ? 0 : -1, message: json.message || '', data: json };
        } catch {
          return { code: -1, message: text || '响应解析失败' };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new Error(`[GameServer] deletePlayer 失败: ${err?.message || err}`);
      }
    }

    return this.request('deletePlayer', params);
  }
}

// ==================== 工厂函数 ====================

/**
 * 根据游戏服务器配置创建客户端实例
 *
 * @param webhost  游戏服基础地址
 * @param protocol 协议模式（默认从系统参数读取，未配置时使用 idip）
 */
export function createGameServerClient(
  webhost: string,
  protocol?: ProtocolMode,
  timeoutMs?: number,
  signKey?: string,
): GameServerClient {
  return new GameServerClient({
    baseURL: webhost,
    protocol: protocol ?? 'idip',
    timeoutMs: timeoutMs ?? parseInt(process.env.GM_TIMEOUT_MS || '10000'),
    signKey: signKey ?? process.env.API_SIGN_KEY ?? '',
  });
}
