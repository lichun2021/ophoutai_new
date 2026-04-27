/**
 * @deprecated 此文件已废弃，请使用 ./gameServerClient.ts 中的 GameServerClient 替代。
 * IdipClient 使用 IDIP 协议数字命令ID(4107/4147/4283等)，仅适用于特定游戏服务器。
 * GameServerClient 使用标准 REST API 命名，同时向后兼容 IDIP 协议。
 */
// 使用Node.js内置的fetch API替代axios

export type Plat = 1 | 2; // 1=Android, 2=iOS

export type IdipClientOptions = {
  baseURL: string;               // 直连脚本服务: http://host:port/script 或 转发服: http://dispatcher:port
  directMode?: boolean;          // true=直连脚本服务(/script/idip/{cmd})，false=转发服(/{Partition}/idip/{cmd})
  timeoutMs?: number;            // 超时
  defaultHeaders?: Record<string, string>; // 网关签名/鉴权可在此增加
  onBuildHeaders?: (body: any) => Record<string, string>; // 动态签名扩展
};

type IdipResponse = {
  head?: Record<string, any>;
  body: { Result: number; RetMsg?: string; [k: string]: any };
};

export class IdipClient {
  private baseURL: string;
  private directMode: boolean;
  private timeoutMs: number;

  constructor(opts: IdipClientOptions) {
    this.baseURL = opts.baseURL.replace(/\/+$/, '');
    this.directMode = opts.directMode ?? true;
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  // 统一路由：直连=> /idip/{cmd}，转发=> /{Partition}/idip/{cmd}
  private buildUrl(partition: string, cmd: string): string {
    return this.directMode ? `/idip/${cmd}` : `/${partition}/idip/${cmd}`;
  }

  // 统一请求封装（payload 包含 head 和 body）
  private async call(partition: string, cmd: string, body: any): Promise<IdipResponse> {
    const url = this.baseURL + this.buildUrl(partition, cmd);
    const payload = {
      head: {
        Cmdid: parseInt(cmd),
        Seqid: "1", 
        TimeStamp: Math.floor(Date.now() / 1000)
      },
      body
    };
    
    console.log(`[IDIP] 请求URL: ${url}`);
    console.log(`[IDIP] 请求参数:`, JSON.stringify(payload, null, 2));
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log(`[IDIP] HTTP状态: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[IDIP] 错误响应内容:`, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log(`[IDIP] 响应内容:`, responseText);
      
      const data: IdipResponse = JSON.parse(responseText);
      
      if (!data || typeof data !== 'object') {
        throw new Error(`IDIP ${cmd} 响应异常`);
      }
      const result = data.body?.Result ?? -9999;
      if (result !== 0) {
        const msg = data.body?.RetMsg || data.head?.RetErrMsg || 'unknown error';
        throw new Error(`IDIP ${cmd} 失败: ${result} ${msg}`);
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`IDIP ${cmd} 请求超时`);
      }
      throw error;
    }
  }

  // 文本字段编码（服务器会 IdipUtil.decode），避免乱码/空格问题
  private static enc(s: string): string {
    return encodeURIComponent(s ?? '');
  }

  private static genSerial(): string {
    // 生成唯一序列号：时间戳 + 随机数
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ===== 业务方法 =====

  // 封号 idip/4147
  async banUser(params: {
    partition: string;
    platId: Plat;
    openId: string;
    banSeconds: number;      // BanTime 秒
    banReason: string;       // BanReason
  }) {
    const { partition, platId, openId, banSeconds, banReason } = params;
    return this.call(partition, '4147', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
      BanTime: banSeconds,
      BanReason: IdipClient.enc(banReason),
    });
  }

  // 解封账号 idip/4107
  async unbanUser(params: {
    partition: string;
    platId: Plat;
    openId: string;
  }) {
    const { partition, platId, openId } = params;
    return this.call(partition, '4107', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
    });
  }

  // 发物资（并以奖励邮件发放）idip/4283
  // 注意：此处理器读取 MailTitle/MailContent 字段
  async sendItems(params: {
    partition: string;
    platId: Plat;
    openId: string;
    roleId?: string;
    title: string;
    content: string;
    items: Array<{ ItemId: number; ItemNum: number }>;
  }) {
    const { partition, platId, openId, roleId, title, content, items } = params;
    return this.call(partition, '4283', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
      RoleId: roleId ?? '',                  // 建议传，精确到角色
      Serial: IdipClient.genSerial(),        // 幂等
      MailTitle: IdipClient.enc(title),
      MailContent: IdipClient.enc(content),
      SendItemList: items,
    });
  }

  // 发送文本邮件 idip/4321
  // 注意：读取 Title/Content 字段
  async sendTextMail(params: {
    partition: string;
    platId: Plat;
    openId: string;
    roleId?: string;
    title: string;
    content: string;
  }) {
    const { partition, platId, openId, roleId, title, content } = params;
    return this.call(partition, '4321', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
      RoleId: roleId ?? '',
      Serial: IdipClient.genSerial(),        // 添加幂等序列号
      Title: IdipClient.enc(title),
      Content: IdipClient.enc(content),
    });
  }

  // 发送账号邮件（幂等 Serial）idip/4109
  // 注意：读取 Title/Content 字段
  async sendAccountMail(params: {
    partition: string;
    platId: Plat;
    openId: string;
    roleId?: string;
    title: string;
    content: string;
  }) {
    const { partition, platId, openId, roleId, title, content } = params;
    return this.call(partition, '4109', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
      RoleId: roleId ?? '',
      Serial: IdipClient.genSerial(),
      Title: IdipClient.enc(title),
      Content: IdipClient.enc(content),
    });
  }

  // GM充值到账（幂等 Serial）idip/4443
  async gmRecharge(params: {
    partition: string;
    platId: Plat;
    openId: string;
    diamond: number; // 钻石数
  }) {
    const { partition, platId, openId, diamond } = params;
    return this.call(partition, '4443', {
      PlatId: platId,
      OpenId: openId,
      Partition: partition,
      Diamond: diamond,
      Serial: IdipClient.genSerial(),
    });
  }

  // 平台迁移（安卓iOS账号内角色互转）idip/4493
  async platformTransfer(params: {
    partition: string;
    areaId: 1 | 2;     // 服务器大区ID：微信（1），手Q（2）
    openId: string;    // 角色的OpenId
  }) {
    const { partition, areaId, openId } = params;
    return this.call(partition, '4493', {
      AreaId: areaId,
      Partition: partition,
      OpenId: openId,
    });
  }

  // 通用：扩展任意 idip/{cmd}
  async callCustom(params: {
    partition: string;
    cmd: string;           // 例如 '4211'
    body: Record<string, any>;
  }) {
    const { partition, cmd, body } = params;
    return this.call(partition, cmd, body);
  }
}