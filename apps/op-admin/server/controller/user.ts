import * as UserModel from '../model/user';
import {H3Event, getHeaders, getQuery} from 'h3';
import { User } from '../model/user';
import * as AdminModel from '../model/admin';
import * as ApisModel from '../model/apis';
import {sql} from '../db';

import * as auth from '../utils/auth';
import * as crypto from 'crypto';
import { getSystemParam } from '../utils/systemConfig';
import { config } from '../config';
import { getRedisCluster } from '../utils/redis-cluster';
import * as PaymentModel from '../model/payment';
import { sdkMessages } from '../utils/i18n';
import { selectGameIpByAmount } from '../utils/gameIp';
import { generateUserLoginUrl } from './payment';
function getGameIp(amount?: number): string {
    const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return selectGameIpByAmount(value);
}

// 计算用户“支付宝/微信”成功充值总额（PaymentRecords）
async function getUserZfbWxSuccessTotal(userId: number): Promise<number> {
    const rows = await sql({
        query: `SELECT COALESCE(SUM(amount), 0) AS total
                FROM PaymentRecords
                WHERE user_id = ?
                  AND payment_status = 3
                  AND payment_way IN ('支付宝', '微信')`,
        values: [userId],
    }) as any[];
    const total = parseFloat(String(rows[0]?.total ?? 0));
    return Number.isFinite(total) ? total : 0;
}

export const read = async() => {
    try{
        const result = await UserModel.read();
        return result;
    }catch{
        throw createError({
            status: 500,
            message: 'Something went wrong',
        });
    }
}

// 验证代理账号状态（公开接口，用于注册页面）
export const checkChannelStatus = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const channelCode = query.channel_code as string;
        
        if (!channelCode) {
            return {
                valid: false,
                message: '缺少渠道代码参数'
            };
        }
        
        // 查询代理账号状态
        const adminResult = await sql({
            query: 'SELECT id, name, channel_code, is_active FROM Admins WHERE channel_code = ?',
            values: [channelCode],
        }) as any[];
        
        if (adminResult.length === 0) {
            return {
                valid: false,
                message: '无效的渠道代码',
                exists: false
            };
        }
        
        const admin = adminResult[0];
        
        if (admin.is_active !== 1) {
            return {
                valid: false,
                message: '该代理账号已被禁用，无法注册',
                exists: true,
                is_active: false
            };
        }
        
        return {
            valid: true,
            message: '代理账号状态正常',
            exists: true,
            is_active: true,
            admin_name: admin.name
        };
    } catch (e: any) {
        console.error('检查代理账号状态失败:', e);
        return {
            valid: false,
            message: '检查代理账号状态时发生错误'
        };
    }
};

export const quickreg = defineEventHandler(async (event) => {
    const query = getQuery(event);
    try{
        // return {
        //     status: "ok",
        //     data: event.context
        // }
        const userid = query?.userid ?? '';
        const token = query?.token ?? '';
        const sign = query?.sign ?? '';
        const channel = query?.channel ?? '';
        const apiUrl = query?.host ?? '';
           //MD5(gameCode+userid+token+KEY) 

        // const stringSignTemp = config.thirdPartyConfig.gameCode+ userid + token + config.thirdPartyConfig.accessKey;

        // const signValue = crypto.createHash('md5')
        // .update(stringSignTemp)
        // .digest('hex')

        // console.log("signValue:", signValue)
        // console.log("sign:", sign)

        // if(signValue != sign){
        //     return {
        //         status: "fail",
        //         msg: "签名错误"
        //     }
        // }

        //验证一下apiUrl是否正确 的字符串格式 长度>5
        if(String(apiUrl).length >10){
            await ApisModel.updateApiUrl(String(apiUrl));
        }

        const result = await UserModel.upsertUserByThirdparty(
            String(userid), 
            String(token),
            String(sign),
            String(channel)
        );

        return {
            status: "ok",
            data: result
        };
    }catch(e: any){
        return {
            status: "fail",
            msg: e.message,
            
        };
    }
});

// // 用户验证接口
// export const checkUser = defineEventHandler(async (event) => {
//     const query = getQuery(event);
//     const body =  await readBody(event);
//     return {
//         code: 200,          

//         msg: "ok",
//     };
// });

export const checkUser = async(evt:H3Event) => {
    const body =  await readBody(evt);
    // await writeLog(`${JSON.stringify(body)}`,"checkUser");
    // 1. 查找用户
    const user = await UserModel.findByThirdpartyUid(body.userid);
    
    if (!user) {

        return { code: -1, msg: "用户不存在" };
    }

    //校检查token是否过期
    const result = await auth.verifyThirdPartyToken(body.token);


    return result;
};

// 用户网页登录接口
export const webLogin = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        const { username, password } = body;
        
        if (!username || !password) {
            throw createError({
                status: 400,
                message: '用户名和密码不能为空',
            });
        }
        
        // 使用UserModel.login进行验证
        const user = await UserModel.login(username, password);
        
        if (!user) {
            throw createError({
                status: 401,
                message: '用户名或密码错误',
            });
        }
        
        // 返回用户信息（不包含密码）
        const { password: pwd, ...userInfo } = user;
        
        return {
            code: 200,
            message: '登录成功',
            data: {
                user: userInfo,
                isUser: true
            }
        };
    } catch (e: any) {
        console.error("用户网页登录异常:", e);
        throw createError({
            status: e.status || 500,
            message: e.message || '登录失败',
        });
    }
};


export const page = async(evt:H3Event) => {
    // 逻辑处理
    const headers = evt.req.headers;

    const page = headers['x-page-number'];
    // 获取特定的请求头，例如 Authorization
    const authorizationHeader = headers['authorization'];

    const token = authorizationHeader ? parseInt(authorizationHeader) : 1;

    const start_data = headers['start_date'];

    const uid  = headers['userid']; 

    const end_data = headers['end_date'];

    const telephone = headers['telephone'] ? parseInt(Array.isArray(headers['telephone']) ? headers['telephone'].join('') : headers['telephone']) : 0;

    const channel_id = headers['channel_id'] ? parseInt(Array.isArray(headers['channel_id']) ? headers['channel_id'].join('') : headers['channel_id']) : 0;

    // 权限检查 - 使用持久化的权限数据
    let permissionsJson = null;
    try {
        const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
        
        if (!adminWithPermissions) {
            throw createError({
                status: 401,
                message: '管理员信息不存在',
            });
        }

        // 直接使用持久化的权限数据
        permissionsJson = { 
            channel_codes: adminWithPermissions.allowed_channel_codes || []
        };
    } catch (error) {
        console.error('权限检查失败:', error);
        throw createError({
            status: 403,
            message: '权限验证失败',
        });
    }

    try{
        const data = await UserModel.readPage(page, permissionsJson, telephone, start_data, end_data, uid);

        const total = await UserModel.count(permissionsJson, telephone, start_data, end_data, uid);

        return {
            data: data,
            total: total,
        };
    }catch{
        throw createError({
            status: 500,
            message: 'Something went wrong',
        });
    }
};



export const insert = async(evt:H3Event) => {
    try{
        const body =  await readBody(evt);

        // 验证必需的参数
        if (!body.channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码参数',
            });
        }
        
        if (!body.game_code) {
            throw createError({
                status: 400,
                message: '缺少游戏代码参数',
            });
        }
        
        // 验证channel_code是否在Admins表中存在
        const adminResult = await sql({
            query: 'SELECT id FROM Admins WHERE channel_code = ? AND is_active = 1',
            values: [body.channel_code],
        }) as any[];
        
        if (adminResult.length === 0) {
            throw createError({
                status: 400,
                message: '无效的渠道代码',
            });
        }
        
        // 验证game_code是否在Games表中存在
        const gameResult = await sql({
            query: 'SELECT id FROM Games WHERE game_code = ? AND is_active = 1',
            values: [body.game_code],
        }) as any[];
        
        if (gameResult.length === 0) {
            throw createError({
                status: 400,
                message: '无效的游戏代码',
            });
        }
        
        // 准备用户数据
        const userData = {
            username: body.username,
            password: body.password,
            iphone: body.iphone || '',
            channel_code: body.channel_code,
            game_code: body.game_code,
            thirdparty_uid: body.thirdparty_uid || `user_${Date.now()}`,
            platform_coins: 0.00
        };

        const result = await UserModel.insert(userData);

        return {
            status: result === null ? "fail" : "success",
            message: result === null ? "注册失败" : "注册成功"
        };
    }catch(e: any){
        throw createError({
            status: e.status || 500,
            message: e.message,
        });
    }
}

export const reg = async(evt:H3Event) => {
    try{
        const body =  await readBody(evt);
        console.log("reg:",body)

        // 检查用户是否已存在
        const existingUser = await UserModel.findByThirdpartyUid(body.thirdparty_uid);
        
        if(existingUser){
            return {
                status: "fail",
                message: "用户已存在！",
            }; 
        }

        // 验证必需的参数
        if (!body.channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码参数',
            });
        }

        if (!body.game_code) {
            throw createError({
                status: 400,
                message: '缺少游戏代码参数',
            });
        }

        // 验证代理账号是否启用
        const adminResult = await sql({
            query: 'SELECT id FROM Admins WHERE channel_code = ? AND is_active = 1',
            values: [body.channel_code],
        }) as any[];

        if (adminResult.length === 0) {
            throw createError({
                status: 400,
                message: '无效的渠道代码或代理账号已被禁用',
            });
        }

        // 准备用户数据
        const userData = {
            username: body.username || `user_${body.thirdparty_uid.substring(0, 8)}`,
            iphone: body.iphone || '',
            password: body.password || '',
            channel_code: body.channel_code,
            game_code: body.game_code,
            thirdparty_uid: body.thirdparty_uid,
            platform_coins: 0.00
        };

        // 创建新用户（同时创建SubUser）
        const result = await UserModel.insert(userData);

        return {
            status: result === null ? "fail" : "success",
            message: result === null ? "注册失败" : "注册成功"
        };
    }catch(e: any){
        console.error('注册错误:', e);
        throw createError({
            status: 500,
            message: e.message || '注册失败',
        });
    }
}

// export const getOne = async(evt:H3Event) => {
//     try{
//         const body =  await readBody(evt);
//         console.log("get:",body)
//         const result = await UserModel.detail(body.name);

//         return {
//             code: result === null ? 404 : 200,
//             data: result,
//         };
//     }catch(e: any){
//         throw createError({
//             status: 500,
//             message: e.message,
//         });
//     }
// }

// export const getOne = defineEventHandler(async (event) => {
//     // 逻辑处理
//     const mob = event.context.params?.mob ?? '';
//     const pwd = event.context.params?.pwd ?? '';

//     try{
//         const result = await UserModel.detail(mob,pwd);

//         return {
//             code: result === null ? 404 : 200,
//             data: result,
//         };
//     }catch(e: any){
//         throw createError({
//             status: 500,
//             message: e.message,
//         });
//     }



//   });

  export const getNewOne = defineEventHandler(async (event) => {
    // 逻辑处理
    const thirdparty_uid = event.context.params?.thirdparty_uid ?? '';
    try{
        // 直接查询 SubUsers 表
        const result = await sql({
            query: 'SELECT * FROM SubUsers WHERE id = ?',
            values: [thirdparty_uid],
        }) as any[];

        console.log("getNewOne result:",result)

        if (result.length === 0) {
            return {
                code: 404,
                data: null,
            };
        }

        // 获取子用户数据，并把 wuid 重命名为 uid
        const subUserData = result[0];
        const responseData = {
            ...subUserData,
            uid: subUserData.wuid,  // 把 wuid 重命名为 uid
        };
        
        // 删除原来的 wuid 字段，避免重复
        delete responseData.wuid;

        return {
            code: 200,
            data: responseData,
        };
    }catch(e: any){
        throw createError({
            status: 500,
            message: e.message,
        });
    }
  });
  

  export const getpostorders = defineEventHandler(async (event) => {
    try {
        const body =  await readBody(event);
      // 获取用户ID
      const thirdparty_uid = body.thirdparty_uid ?? '';
      
      if (!thirdparty_uid) {
        return {
          code: 400,
          message: '缺少用户ID参数'
        };
      }
      
      // 从数据库获取该用户所有状态为3的订单
      const orders = await PaymentModel.getUserOrders(thirdparty_uid);
      
      if (!orders || orders.length === 0) {
        return {
          code: 200,
          data: [],
          message: '没有找到符合条件的订单'
        };
      }
      
      // 获取Redis客户端
      const redis = getRedisCluster();
      
      // 处理订单，检查Redis中的状态
      const validOrders = [];
      
      for (const order of orders) {
        // 从Redis获取交易信息
        try {
          const transactionData = await redis.get(order.transaction_id || '');
          
          if (transactionData) {
            const transaction = JSON.parse(transactionData);
            
            // 检查是否满足 done = 0 和 haspay = 1
            if (transaction.done === 0 && transaction.haspay === 1) {
              validOrders.push({
                ...order,
                redisStatus:transaction
              });
            }
          }
        } catch (redisError) {
          console.error(`获取Redis数据出错，订单ID: ${order.transaction_id}`, redisError);
          // 继续处理下一个订单
        }
      }
      
      return {
        code: 200,
        data: validOrders,
        total: validOrders.length
      };
    } catch (error) {
      console.error('获取订单列表出错:', error);
      throw createError({
        status: 500,
        message: '获取订单列表时发生错误'
      });
    }
  });

  export const getorders = defineEventHandler(async (event) => {
    try {
      // 获取用户ID
      const thirdparty_uid = event.context.params?.thirdparty_uid ?? '';
      
      if (!thirdparty_uid) {
        return {
          code: 400,
          message: '缺少用户ID参数'
        };
      }
      
      // 从数据库获取该用户所有状态为3的订单
      const orders = await PaymentModel.getUserOrders(thirdparty_uid);
      
      if (!orders || orders.length === 0) {
        return {
          code: 200,
          data: [],
          message: '没有找到符合条件的订单'
        };
      }
      
      // 获取Redis客户端
      const redis = getRedisCluster();
      
      // 处理订单，检查Redis中的状态
      const validOrders = [];
      
      for (const order of orders) {
        // 从Redis获取交易信息
        try {
          const transactionData = await redis.get(order.transaction_id || '');
          
          if (transactionData) {
            const transaction = JSON.parse(transactionData);
            
            // 检查是否满足 done = 0 和 haspay = 1
            if (transaction.done === 0 && transaction.haspay === 1) {
              validOrders.push({
                ...order,
                redisStatus:transaction
              });
            }
          }
        } catch (redisError) {
          console.error(`获取Redis数据出错，订单ID: ${order.transaction_id}`, redisError);
          // 继续处理下一个订单
        }
      }
      
      return {
        code: 200,
        data: validOrders,
        total: validOrders.length
      };
    } catch (error) {
      console.error('获取订单列表出错:', error);
      throw createError({
        status: 500,
        message: '获取订单列表时发生错误'
      });
    }
  });

// 用户登录接口
export const userLogin = async(evt: H3Event) => {
    let loginSuccess = false;
    let userId = 0;
    let usernameToLog = '';
    
    try {
        const body = await readBody(evt);
        console.log("用户登录请求:", body);
        
        const { username, password, ts, sig } = body;
        usernameToLog = username || '';
        
        // 获取客户端信息
        const headers = getHeaders(evt);
        const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
        const userAgent = (headers['user-agent'] as string) || '';
        
        if (!username) {
            console.log("用户登录失败: 用户名为空");
            throw createError({ status: 400, message: '用户名不能为空' });
        }
        
        console.log("正在查询用户:", username);

        let user: any[] = [];
        if (password) {
            // 传统密码登录
            user = await sql({
                query: 'SELECT * FROM Users WHERE username = ? AND password = ?',
                values: [username, password],
            }) as any[];
        } else if (sig && ts) {
            // 签名免密登录：md5(username + ts + secret)
            const now = Math.floor(Date.now() / 1000);
            const tsNum = parseInt(String(ts));
            if (isNaN(tsNum) || Math.abs(now - tsNum) > 300) {
                throw createError({ status: 401, message: '签名已过期' });
            }
            const secret = await getSystemParam('user_auto_login_secret', '12w12rdf43r43t564y7');
            const expect = crypto.createHash('md5').update(`${username}${tsNum}${secret}`).digest('hex');
            
            console.log('签名验证详情:', {
                username,
                tsNum,
                secret,
                expectSig: expect,
                receivedSig: sig,
                matched: expect === String(sig)
            });
            
            if (expect !== String(sig)) {
                throw createError({ status: 401, message: '签名无效' });
            }
            user = await sql({
                query: 'SELECT * FROM Users WHERE username = ? LIMIT 1',
                values: [username],
            }) as any[];
        } else {
            throw createError({ status: 400, message: '缺少密码或签名' });
        }
        
        console.log("数据库查询结果:", user.length > 0 ? "找到用户" : "未找到用户");
        
        if (user.length === 0) {
            console.log("用户登录失败: 用户名或密码错误");
            
            // 记录失败的登录尝试
            const UserLoginLogsModel = await import('../model/userLoginLogs');
            await UserLoginLogsModel.recordLogin({
                username: usernameToLog,
                game_code: '',
                login_time: new Date().toISOString(),
                imei: '',
                ip_address: ipAddress,
                device: userAgent,
                channel_code: ''
            });
            
            throw createError({
                status: 401,
                message: '用户名或密码错误',
            });
        }
        
        const userData = user[0] as User;
        userId = userData.id!;

        let rechargeUrl = '';
        let mallUrl = '';
        if (userId) {
            const generatedUrl = await generateUserLoginUrl(userId, '/user/cashier');
            const generatedmallUrl = await generateUserLoginUrl(userId, '/user/mall');
            if (generatedUrl) {
                rechargeUrl = generatedUrl;
            }
            if (generatedmallUrl) {
                mallUrl = generatedmallUrl;
            }
        }
        
        // 检查用户状态
        const userStatus = parseInt(String(userData.status ?? '0')) || 0;
        if (userStatus === 1) {
            console.log("用户登录失败: 用户已被封号");
            
            // 记录被封号用户的登录尝试
            const UserLoginLogsModel = await import('../model/userLoginLogs');
            await UserLoginLogsModel.recordLogin({
                username: userData.username || '',
                game_code: '',
                login_time: new Date().toISOString(),
                imei: '',
                ip_address: ipAddress,
                device: userAgent,
                channel_code: userData.channel_code || ''
            });
            
            throw createError({
                status: 403,
                message: '您的账号已被封号，无法登录',
            });
        }
        
        loginSuccess = true;
        
        console.log("用户登录成功:", userData.username);
        
        // 记录成功的登录
        const UserLoginLogsModel = await import('../model/userLoginLogs');
        await UserLoginLogsModel.recordLogin({
            username: userData.username || '',
            game_code: '', // 暂时为空，后续可根据需要填充
            login_time: new Date().toISOString(),
            imei: '', // 暂时为空，需要从客户端传递
            ip_address: ipAddress,
            device: userAgent,
            channel_code: userData.channel_code || ''
        });
        
        // 返回用户信息（不包含密码）
        const { password: pwd, ...userInfo } = userData;
        
        // 使用“支付宝/微信成功充值总额”来选择游戏服IP
        const rechargeTotal = await getUserZfbWxSuccessTotal(userId);

        const response = {
            code: 200,
            message: '登录成功',
            data: {
                user: userInfo,
                rechargeUrl: rechargeUrl,
                mallUrl: mallUrl,

                // 根据该用户支付宝/微信成功充值总额选择游戏服IP
                gameip: getGameIp(rechargeTotal),
                isUser: true
            }
        };
        
        console.log("用户登录返回数据:", response);
        return response;
    } catch (e: any) {
        console.error("用户登录异常:", e);
        
        // 如果还没有记录过登录日志且有用户名，记录失败的登录
        if (!loginSuccess && usernameToLog) {
            try {
                const headers = getHeaders(evt);
                const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
                const userAgent = (headers['user-agent'] as string) || '';
                
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: usernameToLog,
                    game_code: '',
                    login_time: new Date().toISOString(),
                    imei: '',
                    ip_address: ipAddress,
                    device: userAgent,
                    channel_code: ''
                });
            } catch (logError) {
                console.error("记录登录日志失败:", logError);
            }
        }        
        throw createError({
            status: e.status || 500,
            message: e.message || '登录失败',
        });
    }
};

// SDK登录接口
export const sdkLogin = async(evt: H3Event) => {
    let loginSuccess = false;
    let usernameToLog = '';
    
    try {
        const body = await readBody(evt);
        // 避免打印明文密码、设备标识等敏感信息
        console.log("SDK登录", { username: body?.z || '', gameId: body?.d || '' });
        
        // 获取SDK参数
        const {
            z: username,     // 用户名
            b: password,     // 密码
            c: loginType,    // 登录类型
            d: gameId,       // 游戏ID
            e: imei,         // 设备IMEI
            f: agentId,      // 代理ID
            x: appId,        // APP ID
            h: deviceInfo,   // 设备信息
            i: quickLogin,   // 快速登录标识
            vs: versionCode, // 版本号
            sid: serverId,   // 服务器ID
            o: dpi,          // 屏幕信息
            p: deviceName,   // 设备名
            q: netType,      // 网络类型
            r: providersName,// 运营商
            s: deviceInfo2,  // 设备信息2
            si: isEmulator   // 模拟器检测
        } = body;
        
        usernameToLog = username || '';
        
        // 获取客户端信息
        const headers = getHeaders(evt);
        const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
        const userAgent = (headers['user-agent'] as string) || '';
        
        if (!username || !password) {
            console.log("SDK登录失败: 用户名或密码为空");
            return {
                z: -1,
                x: sdkMessages.login.missingCredentials(),
                b: "",
                c: "",
                d: "",
                sid: serverId || "",
                e: Date.now().toString()
            };
        }
        
        console.log("正在查询SDK用户:", username);
        
        // 通过用户名和密码查找用户
        const user = await sql({
            query: 'SELECT * FROM Users WHERE username = ? AND password = ?',
            values: [username, password],
        }) as any[];
        
        console.log("SDK数据库查询结果:", user.length > 0 ? "找到用户" : "未找到用户");
        
        if (user.length === 0) {
            console.log("SDK登录失败: 用户名或密码错误");
            
            // 记录失败的登录尝试
            try {
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: usernameToLog,
                    game_code: gameId || '',
                    login_time: new Date().toISOString(),
                    imei: imei || '',
                    ip_address: ipAddress,
                    device: deviceInfo || userAgent,
                    channel_code: agentId || ''
                });
            } catch (logError) {
                console.error("记录SDK登录日志失败:", logError);
            }
            
            return {
                z: -1,
                x: sdkMessages.login.invalidCredentials(),
                b: "",
                c: "",
                d: "",
                sid: serverId || "",
                e: Date.now().toString()
            };
        }
        
        const userData = user[0] as User;
        
        // 检查用户状态
        const userStatus = parseInt(String(userData.status ?? '0')) || 0;
        if (userStatus === 1) {
            console.log("SDK登录失败: 用户已被封号");
            
            // 记录被封号用户的登录尝试
            try {
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: userData.username || '',
                    game_code: gameId || '',
                    login_time: new Date().toISOString(),
                    imei: imei || '',
                    ip_address: ipAddress,
                    device: deviceInfo || userAgent,
                    channel_code: userData.channel_code || agentId || ''
                });
            } catch (logError) {
                console.error("记录SDK登录日志失败:", logError);
            }
            
            return {
                z: -1,
                x: "您的账号已被封号，无法登录",
                b: "",
                c: "",
                d: "",
                sid: serverId || "",
                e: Date.now().toString()
            };
        }
        
        loginSuccess = true;
        
        console.log("SDK用户登录成功:", userData.username);
        
        // // 记录成功的登录
        // try {
        //     const UserLoginLogsModel = await import('../model/userLoginLogs');
        //     await UserLoginLogsModel.recordLogin({
        //         username: userData.username || '',
        //         game_code: gameId || '',
        //         login_time: new Date().toISOString(),
        //         imei: imei || '',
        //         ip_address: ipAddress,
        //         device: deviceInfo || userAgent,
        //         channel_code: userData.channel_code || agentId || ''
        //     });
        // } catch (logError) {
        //     console.error("记录SDK登录日志失败:", logError);
        // }
        
        // 生成签名 (可以根据需要实现具体的签名逻辑)
        const sign = crypto.createHash('md5')
            .update(`${userData.username}${Date.now()}${config.thirdPartyConfig?.accessKey || 'default_key'}`)
            .digest('hex');
        
        // 使用“支付宝/微信成功充值总额”来选择游戏服IP
        const rechargeTotal = await getUserZfbWxSuccessTotal(userData.id!);

        let rechargeUrl = '';
        let mallUrl = '';
        const userId = userData.id!;
        if (userId) {
            const generatedUrl = await generateUserLoginUrl(userId, '/user/cashier');
            const generatedmallUrl = await generateUserLoginUrl(userId, '/user/mall');
            if (generatedUrl) {
                rechargeUrl = generatedUrl;
            }
            if (generatedmallUrl) {
                mallUrl = generatedmallUrl;
            }
        }

        // 返回SDK格式的响应
        const response = {
            z: 1,                                    // 成功状态码
            x: sdkMessages.login.success(),          // 消息
            b: userData.username || "",              // 用户名
            c: userData.password || "",              // 密码（如果需要返回）
            d: sign,                                 // 签名
            sid: serverId || "",                     // 服务器ID
            e: Date.now().toString(),                // 登录时间戳  
            gameip: getGameIp(rechargeTotal),          // 按支付宝/微信成功充值总额选择游戏服IP
            rechargeUrl: rechargeUrl,
            mallUrl: mallUrl
        };
        
        console.log("SDK登录返回数据:", response);
        return response;
        
    } catch (e: any) {
        console.error("SDK登录异常:", e);
        
        // 如果还没有记录过登录日志且有用户名，记录失败的登录
        if (!loginSuccess && usernameToLog) {
            try {
                const headers = getHeaders(evt);
                const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
                const userAgent = (headers['user-agent'] as string) || '';
                
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: usernameToLog,
                    game_code: '',
                    login_time: new Date().toISOString(),
                    imei: '',
                    ip_address: ipAddress,
                    device: userAgent,
                    channel_code: ''
                });
            } catch (logError) {
                console.error("记录SDK登录日志失败:", logError);
            }
        }
        
        return {
            z: -1,
            x: e.message || sdkMessages.login.failed(),
            b: "",
            c: "",
            d: "",
            sid: "",
            e: Date.now().toString()
        };
    }
};

// Steam登录接口 - 账号不存在时自动注册
export const steamLogin = async(evt: H3Event) => {
    let loginSuccess = false;
    let usernameToLog = '';
    
    try {
        const body = await readBody(evt);
        console.log("Steam登录", { username: body?.z || '', gameId: body?.d || '' });
        
        // 获取SDK参数（和sdkLogin一致）
        const {
            z: username,     // 用户名
            b: password,     // 密码
            c: loginType,    // 登录类型
            d: gameId,       // 游戏ID
            e: imei,         // 设备IMEI
            f: agentId,      // 代理ID
            x: appId,        // APP ID
            h: deviceInfo,   // 设备信息
            i: quickLogin,   // 快速登录标识
            vs: versionCode, // 版本号
            sid: serverId,   // 服务器ID
            o: dpi,          // 屏幕信息
            p: deviceName,   // 设备名
            q: netType,      // 网络类型
            r: providersName,// 运营商
            s: deviceInfo2,  // 设备信息2
            si: isEmulator   // 模拟器检测
        } = body;
        
        usernameToLog = username || '';
        
        // 获取客户端信息
        const headers = getHeaders(evt);
        const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
        const userAgent = (headers['user-agent'] as string) || '';
        
        if (!username || !password) {
            console.log("Steam登录失败: 用户名或密码为空");
            return {
                z: -1,
                x: sdkMessages.login.missingCredentials(),
                b: "",
                c: "",
                d: "",
                sid: serverId || "",
                e: Date.now().toString()
            };
        }
        
        console.log("正在查询Steam用户:", username);
        
        // 通过用户名和密码查找用户
        let user = await sql({
            query: 'SELECT * FROM Users WHERE username = ? AND password = ?',
            values: [username, password],
        }) as any[];
        
        console.log("Steam数据库查询结果:", user.length > 0 ? "找到用户" : "未找到用户");
        
        // ========== 账号不存在时自动注册 ==========
        if (user.length === 0) {
            console.log("Steam登录: 用户不存在，开始自动注册...", username);
            
            // 先检查用户名是否被其他密码注册了（防止密码错误导致重复注册）
            const existingByName = await sql({
                query: 'SELECT id FROM Users WHERE username = ?',
                values: [username],
            }) as any[];
            
            if (existingByName.length > 0) {
                // 用户名存在但密码不对，属于密码错误，不应自动注册
                console.log("Steam登录失败: 用户名存在但密码错误");
                
                try {
                    const UserLoginLogsModel = await import('../model/userLoginLogs');
                    await UserLoginLogsModel.recordLogin({
                        username: usernameToLog,
                        game_code: gameId || '',
                        login_time: new Date().toISOString(),
                        imei: imei || '',
                        ip_address: ipAddress,
                        device: deviceInfo || userAgent,
                        channel_code: agentId || ''
                    });
                } catch (logError) {
                    console.error("记录Steam登录日志失败:", logError);
                }
                
                return {
                    z: -1,
                    x: sdkMessages.login.invalidCredentials(),
                    b: "",
                    c: "",
                    d: "",
                    sid: serverId || "",
                    e: Date.now().toString()
                };
            }
            
            // 用户完全不存在，执行自动注册
            const thirdpartyUid = `steam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 确定 channel_code 和 game_code
            const channelCode = agentId || 'default';
            const gameCode = gameId || 'default';
            
            // 准备用户数据
            const userData = {
                username: username.trim(),
                password: password,
                iphone: '',
                channel_code: channelCode,
                game_code: gameCode,
                thirdparty_uid: thirdpartyUid,
                platform_coins: 0.00
            };
            
            // 插入用户（UserModel.insert 内部事务会自动创建默认小号 "小号1_小号1"）
            const insertResult = await UserModel.insert(userData);
            
            console.log("Steam自动注册成功:", { userId: insertResult.insertId, thirdpartyUid, username });
            
            // 重新查询刚注册的用户
            user = await sql({
                query: 'SELECT * FROM Users WHERE username = ? AND password = ?',
                values: [username, password],
            }) as any[];
            
            if (user.length === 0) {
                console.log("Steam登录: 自动注册后仍无法找到用户");
                return {
                    z: -1,
                    x: "注册后登录失败，请重试",
                    b: "",
                    c: "",
                    d: "",
                    sid: serverId || "",
                    e: Date.now().toString()
                };
            }
        }
        
        const userData = user[0] as User;
        
        // 检查用户状态
        const userStatus = parseInt(String(userData.status ?? '0')) || 0;
        if (userStatus === 1) {
            console.log("Steam登录失败: 用户已被封号");
            
            try {
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: userData.username || '',
                    game_code: gameId || '',
                    login_time: new Date().toISOString(),
                    imei: imei || '',
                    ip_address: ipAddress,
                    device: deviceInfo || userAgent,
                    channel_code: userData.channel_code || agentId || ''
                });
            } catch (logError) {
                console.error("记录Steam登录日志失败:", logError);
            }
            
            return {
                z: -1,
                x: "您的账号已被封号，无法登录",
                b: "",
                c: "",
                d: "",
                sid: serverId || "",
                e: Date.now().toString()
            };
        }
        
        // ========== 确保有默认小号 ==========
        const subAccounts = await sql({
            query: 'SELECT id FROM SubUsers WHERE parent_user_id = ?',
            values: [userData.id],
        }) as any[];
        
        if (subAccounts.length === 0) {
            console.log("Steam登录: 用户没有小号，创建默认小号...");
            const SubUsersModel = await import('../model/subUsers');
            await SubUsersModel.insert({
                parent_user_id: userData.id!,
                username: "小号1_小号1"
            });
            console.log("Steam登录: 默认小号创建成功");
        }
        
        loginSuccess = true;
        
        console.log("Steam用户登录成功:", userData.username);
        
        // 生成签名
        const sign = crypto.createHash('md5')
            .update(`${userData.username}${Date.now()}${config.thirdPartyConfig?.accessKey || 'default_key'}`)
            .digest('hex');
        
        // 使用"支付宝/微信成功充值总额"来选择游戏服IP
        const rechargeTotal = await getUserZfbWxSuccessTotal(userData.id!);

        let rechargeUrl = '';
        let mallUrl = '';
        const userId = userData.id!;
        if (userId) {
            const generatedUrl = await generateUserLoginUrl(userId, '/user/cashier');
            const generatedmallUrl = await generateUserLoginUrl(userId, '/user/mall');
            if (generatedUrl) {
                rechargeUrl = generatedUrl;
            }
            if (generatedmallUrl) {
                mallUrl = generatedmallUrl;
            }
        }

        // 返回SDK格式的响应（与sdkLogin一致）
        const response = {
            z: 1,                                    // 成功状态码
            x: sdkMessages.login.success(),          // 消息
            b: userData.username || "",              // 用户名
            c: userData.password || "",              // 密码
            d: sign,                                 // 签名
            sid: serverId || "",                     // 服务器ID
            e: Date.now().toString(),                // 登录时间戳  
            gameip: getGameIp(rechargeTotal),          // 按支付宝/微信成功充值总额选择游戏服IP
            rechargeUrl: rechargeUrl,
            mallUrl: mallUrl
        };
        
        console.log("Steam登录返回数据:", response);
        return response;
        
    } catch (e: any) {
        console.error("Steam登录异常:", e);
        
        // 如果还没有记录过登录日志且有用户名，记录失败的登录
        if (!loginSuccess && usernameToLog) {
            try {
                const headers = getHeaders(evt);
                const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
                const userAgent = (headers['user-agent'] as string) || '';
                
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin({
                    username: usernameToLog,
                    game_code: '',
                    login_time: new Date().toISOString(),
                    imei: '',
                    ip_address: ipAddress,
                    device: userAgent,
                    channel_code: ''
                });
            } catch (logError) {
                console.error("记录Steam登录日志失败:", logError);
            }
        }
        
        return {
            z: -1,
            x: e.message || sdkMessages.login.failed(),
            b: "",
            c: "",
            d: "",
            sid: "",
            e: Date.now().toString()
        };
    }
};

// SDK子账号管理接口

/**
 * 获取子账号列表
 * SDK接口: POST /sdkapi/login/xiaohao
 */
export const getSubAccountList = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("获取子账号列表请求:", body);
        
        const {
            z: username,     // 用户名
            c: gameId,       // 游戏ID
            e: agentId,      // 代理ID
            f: appId         // APP ID
        } = body;
        
        if (!username) {
            // 设置HTTP状态码为200，但业务code为失败
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "用户名不能为空",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        // 通过用户名查找主用户
        const user = await sql({
            query: 'SELECT id FROM Users WHERE username = ?',
            values: [username],
        }) as any[];
        
        if (user.length === 0) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "用户不存在",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        const userId = user[0].id;
        
        // 获取该用户的所有子账号
        const SubUsersModel = await import('../model/subUsers');
        const subUsers = await SubUsersModel.findByParentUserId(userId);
        
        // 转换为响应格式
        const currentTime = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
        const subAccountList = subUsers.map(subUser => {
            // 生成签名 - 使用 subUser.id 来生成签名
            const signString = `${subUser.id}${currentTime}${config.thirdPartyConfig?.accessKey || 'default_key'}`;
            const sign = crypto.createHash('md5').update(signString).digest('hex');
            
            return {
                username: subUser.id?.toString() || '',  // 返回 subusers 的 id
                nickname: subUser.username,              // nickname 是子账号的完整名称
                login_time: currentTime,
                sign: sign
            };
        });
        
        // 设置HTTP状态码为200
        setResponseStatus(evt, 200);
        
        return {
            code: "1",  // 成功返回字符串"1"
            data: subAccountList,
            msg: "查询成功",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
        
    } catch (e: any) {
        console.error("获取子账号列表异常:", e);
        setResponseStatus(evt, 200);
        return {
            code: "0",
            data: [],
            msg: e.message || "获取子账号列表失败",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
    }
};

/**
 * 添加子账号
 * SDK接口: POST /sdkapi/login/addxiaohao
 */
export const addSubAccount = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("添加子账号请求:", body);
        
        const {
            z: username,        // 主用户名
            c: gameId,          // 游戏ID
            e: agentId,         // 代理ID
            f: appId,           // APP ID
            x: subAccountName   // 子账号名称
        } = body;
        
        if (!username) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "用户名不能为空",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        // 通过用户名查找主用户
        const user = await sql({
            query: 'SELECT id FROM Users WHERE username = ?',
            values: [username],
        }) as any[];
        
        if (user.length === 0) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "主用户不存在",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        const userId = user[0].id;
        
        // 获取该主用户的子账号数量，用于计算序号
        const SubUsersModel = await import('../model/subUsers');
        const subUserCount = await SubUsersModel.countByParentUserId(userId);
        
        if (subUserCount >= 10) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "每个主账号最多只能创建10个子账号",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        // 计算当前是第几个小号（从1开始）
        const subAccountIndex = subUserCount + 1;
        
        // 生成子账号名称：小号{序号}_{昵称}
        // 如果没有传入昵称，则默认为"小号{序号}"
        const nickname = subAccountName || `小号${subAccountIndex}`;
        const finalSubAccountName = `小号${subAccountIndex}_${nickname}`;
        
        // 检查生成的子账号名是否已存在（虽然概率很小，但为了安全起见）
        const existingSubUser = await SubUsersModel.findByUsername(finalSubAccountName);
        
        if (existingSubUser) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "子账号名已存在",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        // 创建子账号
        const result = await SubUsersModel.insert({
            parent_user_id: userId,
            username: finalSubAccountName
        });
        
        // 获取插入后的完整子账号列表
        const subUsers = await SubUsersModel.findByParentUserId(userId);
        
        // 转换为响应格式，username 字段返回 subusers 的 id
        const currentTime = Math.floor(Date.now() / 1000);
        const subAccountList = subUsers.map(subUser => {
            const signString = `${subUser.id}${currentTime}${config.thirdPartyConfig?.accessKey || 'default_key'}`;
            const sign = crypto.createHash('md5').update(signString).digest('hex');
            
            return {
                username: subUser.id?.toString() || '',  // 返回 subusers 的 id
                nickname: subUser.username,              // nickname 是子账号的完整名称
                login_time: currentTime,
                sign: sign
            };
        });
        
        setResponseStatus(evt, 200);
        return {
            code: "1",  // 成功返回字符串"1"
            data: subAccountList,  // 返回完整的子账号列表
            msg: "添加子账号成功",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
        
    } catch (e: any) {
        console.error("添加子账号异常:", e);
        
        // 处理数据库触发器错误
        if (e.message && e.message.includes('不能为单个主账号创建超过10个子账号')) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: "每个主账号最多只能创建10个子账号",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        setResponseStatus(evt, 200);
        return {
            code: "0",
            data: [],
            msg: e.message || "添加子账号失败",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
    }
};

/**
 * 编辑子账号昵称
 * SDK接口: POST /sdkapi/login/editSubAccount
 */
export const editSubAccountNickname = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("编辑子账号昵称请求:", body);
        
        const {
            username,           // 主用户名
            gid: gameId,        // 游戏ID
            cpsId: agentId,     // 代理ID
            appid: appId,       // APP ID
            nickname,           // 昵称
            subAccount          // 子账号名称
        } = body;
        
        if (!username || !subAccount || !nickname) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: null,
                msg: "用户名、子账号名和昵称不能为空",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        // 通过用户名查找主用户
        const user = await sql({
            query: 'SELECT id FROM Users WHERE username = ?',
            values: [username],
        }) as any[];
        
        if (user.length === 0) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: null,
                msg: "主用户不存在",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        const userId = user[0].id;
        
        // 查找子账号并验证是否属于该主用户
        const subUser = await sql({
            query: 'SELECT id FROM SubUsers WHERE username = ? AND parent_user_id = ?',
            values: [subAccount, userId],
        }) as any[];
        
        if (subUser.length === 0) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: null,
                msg: "子账号不存在或不属于该主用户",
                djq: null,
                ttb: null,
                discount: null,
                flb: 0
            };
        }
        
        const subUserId = subUser[0].id;
        
        // 更新子账号昵称（直接更新username字段，因为username就是nickname）
        await sql({
            query: 'UPDATE SubUsers SET username = ? WHERE id = ?',
            values: [nickname, subUserId],
        });
        
        // 生成签名
        const currentTime = Math.floor(Date.now() / 1000);
        const signString = `${nickname}${currentTime}${config.thirdPartyConfig?.accessKey || 'default_key'}`;
        const sign = crypto.createHash('md5').update(signString).digest('hex');
        
        setResponseStatus(evt, 200);
        return {
            code: "1",  // 成功返回字符串"1"
            data: {
                username: nickname,
                nickname: nickname,
                login_time: currentTime,
                sign: sign
            },
            msg: "编辑子账号昵称成功",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
        
    } catch (e: any) {
        console.error("编辑子账号昵称异常:", e);
        setResponseStatus(evt, 200);
        return {
            code: "0",
            data: null,
            msg: e.message || "编辑子账号昵称失败",
            djq: null,
            ttb: null,
            discount: null,
            flb: 0
        };
    }
};

/**
 * 角色上报接口
 * SDK接口: POST /sdkapi/user/setRole
 */
export const reportRole = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("角色上报请求:", body);
        
        const {
            z: username,        // 主用户名
            b: gameId,          // 游戏ID
            i: appId,           // APP ID
            xh: subUserId,      // 子账号ID（subusers表的id）
            c: characterUuid,   // 角色UUID（角色的唯一标识）
            d: roleName,        // 角色名称
            e: roleLevel,       // 角色等级
            f: serverId,        // 服务器ID
            x: serverName,      // 服务器名称
            h: extData          // 扩展信息
        } = body;
        
        // 参数验证
        if (!username || !gameId || !subUserId || !characterUuid || !roleName || !serverName) {
            setResponseStatus(evt, 200);
            return {
                z: -1,
                x: "缺少必要参数",
                b: "",
                c: "",
                d: "",
                sid: "",
                e: Date.now().toString()
            };
        }
        
        // 查找主用户
        const user = await sql({
            query: 'SELECT id FROM Users WHERE username = ?',
            values: [username],
        }) as any[];
        
        if (user.length === 0) {
            setResponseStatus(evt, 200);
            return {
                z: -1,
                x: "主用户不存在",
                b: "",
                c: "",
                d: "",
                sid: "",
                e: Date.now().toString()
            };
        }
        
        const userId = user[0].id;
        
        // 通过子账号ID查找子账号
        const SubUsersModel = await import('../model/subUsers');
        const subUser = await SubUsersModel.findById(parseInt(subUserId));
        
        if (!subUser || subUser.parent_user_id !== userId) {
            setResponseStatus(evt, 200);
            return {
                z: -1,
                x: "子账号不存在或不属于该主用户",
                b: "",
                c: "",
                d: "",
                sid: "",
                e: Date.now().toString()
            };
        }
        
        // 角色上报不需要验证游戏ID，直接使用传入的游戏ID
        // 游戏验证已在前端或其他地方完成
        
        // 解析游戏ID为数字，避免 NaN 写入导致 SQL 报错（Unknown column 'NaN' in 'field list'）
        let gameIdNum = parseInt(gameId as any, 10);
        if (!Number.isFinite(gameIdNum)) {
            gameIdNum = 1; // 无法解析时使用0占位，不影响后续逻辑
        }

        // 准备角色数据（使用传入的characterUuid作为唯一标识）
        const characterData = {
            user_id: userId,
            subuser_id: subUser.id!,
            game_id: gameIdNum,
            uuid: characterUuid.toString(),
            character_name: roleName.toString(),
            character_level: parseInt(roleLevel) || 1,
            server_name: serverName.toString(),
            server_id: parseInt(serverId) || 1,
            ext: extData || null
        };
        
        // 执行角色上报（存在则更新，不存在则插入）
        const GameCharactersModel = await import('../model/gameCharacters');
        const result = await GameCharactersModel.upsertByUuid(characterData);
        
        console.log(`角色上报成功: ${result.isNew ? '新建' : '更新'} 角色ID=${result.id}`);
        
        // 角色上报成功后，自动调用登录日志上报
        try {
            console.log("角色上报成功，开始自动上报登录日志");
            
            // 获取客户端信息
            const headers = getHeaders(evt);
            const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
            
            // 从Users表获取游戏代码和渠道码
            const userInfoResult = await sql({
                query: 'SELECT game_code, channel_code FROM Users WHERE id = ?',
                values: [userId],
            }) as any[];
            
            if (userInfoResult.length > 0) {
                const { game_code: gameCode, channel_code: channelCode } = userInfoResult[0];
                
                // 准备登录日志数据
                const loginLogData = {
                    username: subUser.username,  // 使用子账号用户名
                    sub_user_id: subUser.id,     // 子账号ID
                    sub_user_name: subUser.username, // 子账号名称（用于显示）
                    game_code: gameCode,
                    login_time: new Date().toISOString(),
                    imei: '', // 角色上报中没有设备信息
                    ip_address: ipAddress,
                    device: 'Unknown', // 角色上报中没有设备类型信息
                    channel_code: channelCode // 从users表获取channel_code
                };
                
                // 记录登录日志
                const UserLoginLogsModel = await import('../model/userLoginLogs');
                await UserLoginLogsModel.recordLogin(loginLogData);
                
                console.log(`自动登录日志上报成功: 用户=${loginLogData.username}, 游戏=${gameCode}, 渠道=${channelCode}`);
            }
        } catch (loginLogError: any) {
            // 登录日志上报失败不应该影响角色上报的成功响应
            console.error("自动登录日志上报失败:", loginLogError);
        }
        
        setResponseStatus(evt, 200);
        return {
            z: 0,  // 成功
            x: "角色上报成功",
            b: result.isNew ? "新建角色" : "更新角色",
            c: result.id?.toString() || "",
            d: characterData.character_name,
            sid: characterData.server_id?.toString() || "",
            e: Date.now().toString()
        };
        
    } catch (e: any) {
        console.error("角色上报异常:", e);
        setResponseStatus(evt, 200);
        return {
            z: -1,
            x: e.message || "角色上报失败",
            b: "",
            c: "",
            d: "",
            sid: "",
            e: Date.now().toString()
        };
    }
};

/**
 * 更新子用户wuid接口
 * @route POST /api/user/update-subuser-wuid
 * @body {thirdparty_uid: string, wuid: string}
 * @returns {Object} 更新结果
 */
export const updateSubUserWuid = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("更新子用户wuid请求:", body);
        
        const { thirdparty_uid, uid } = body;
        
        // 参数验证
        if (!thirdparty_uid || !uid) {
            return {
                success: false,
                message: '缺少必要参数：thirdparty_uid 和 uid 不能为空'
            };
        }
        
        // 调用模型函数进行更新
        const SubUsersModel = await import('../model/subUsers');
        const result = await SubUsersModel.updateWuidByThirdpartyUid(thirdparty_uid, uid);
        
        return result;
        
    } catch (error) {
        console.error('更新子用户wuid失败:', error);
        return {
            success: false,
            message: '注册失败：系统错误'
        };
    }
};

// /**
//  * 登录日志上报接口
//  * SDK接口: POST /sdkapi/index/adddllog
//  */
// export const reportLoginLog = async(evt: H3Event) => {
//     try {
//         const body = await readBody(evt);
//         console.log("登录日志上报请求:", body);
        
//         const {
//             username,        // 主用户名
//             cpsId,          // 代理ID
//             gid,            // 游戏ID
//             xh,             // 子账号用户名
//             login_device    // 登录设备 (2=Android)
//         } = body;
        
//         // 参数验证
//         if (!username || !gid) {
//             setResponseStatus(evt, 200);
//             return {
//                 z: -1,
//                 x: "缺少必要参数：用户名和游戏ID不能为空",
//                 b: "",
//                 c: "",
//                 d: "",
//                 sid: "",
//                 e: Date.now().toString()
//             };
//         }
        
//         // 获取客户端信息
//         const headers = getHeaders(evt);
//         const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
//         const userAgent = (headers['user-agent'] as string) || '';
        
//         // 验证用户是否存在，同时获取game_code和channel_code
//         const user = await sql({
//             query: 'SELECT id, channel_code, game_code FROM Users WHERE username = ?',
//             values: [username],
//         }) as any[];
        
//         if (user.length === 0) {
//             setResponseStatus(evt, 200);
//             return {
//                 z: -1,
//                 x: "用户不存在",
//                 b: "",
//                 c: "",
//                 d: "",
//                 sid: "",
//                 e: Date.now().toString()
//             };
//         }
        
//         const userData = user[0];
//         const gameCode = userData.game_code;
        
//         // 设备类型映射
//         const deviceTypeMap: { [key: string]: string } = {
//             '1': 'Mobile-iOS',
//             '2': 'Mobile-Android',
//             '3': 'PC-Windows',
//             '4': 'PC-Mac',
//             '5': 'Web-Browser'
//         };
        
//         const deviceType = deviceTypeMap[login_device?.toString()] || 'Unknown';
        
//         // 准备登录日志数据
//         const loginLogData = {
//             username: xh || username,  // 优先使用子账号用户名，没有则使用主用户名
//             game_code: gameCode,
//             login_time: new Date().toISOString(),
//             imei: '', // 移动端可能会传递IMEI，这里暂时为空
//             ip_address: ipAddress,
//             device: deviceType,
//             channel_code: cpsId || userData.channel_code || ''
//         };
        
//         // 记录登录日志
//         const UserLoginLogsModel = await import('../model/userLoginLogs');
//         const result = await UserLoginLogsModel.recordLogin(loginLogData);
        
//         console.log(`登录日志上报成功: 用户=${loginLogData.username}, 游戏=${gameCode}, 设备=${deviceType}`);
        
//         setResponseStatus(evt, 200);
//         return {
//             z: 0,  // 成功
//             x: "登录日志上报成功",
//             b: loginLogData.username,
//             c: gameCode,
//             d: deviceType,
//             sid: cpsId || "",
//             e: Date.now().toString()
//         };
        
//     } catch (e: any) {
//         console.error("登录日志上报异常:", e);
//         setResponseStatus(evt, 200);
//         return {
//             z: -1,
//             x: e.message || "登录日志上报失败",
//             b: "",
//             c: "",
//             d: "",
//             sid: "",
//             e: Date.now().toString()
//         };
//     }
// };

/**
 * 用户注册接口 - 插入 Users 表
 * @route POST /api/user/register
 * @body {username: string, password: string, channel_code: string, game_code: string, thirdparty_uid?: string, iphone?: string}
 * @returns {Object} 注册结果
 */
export const register = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("用户注册请求:", body);
        
        // 参数验证
        if (!body.username || !body.password) {
            return {
                status: "fail",
                message: "用户名和密码不能为空"
            };
        }
        
        if (!body.channel_code) {
            return {
                status: "fail",
                message: "缺少渠道代码参数"
            };
        }
        
        if (!body.game_code) {
            return {
                status: "fail",
                message: "缺少游戏代码参数"
            };
        }
        
        // 生成第三方用户ID（如果未提供）
        const thirdpartyUid = body.thirdparty_uid || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 检查用户名是否已存在
        const existingUserByUsername = await sql({
            query: 'SELECT id FROM Users WHERE username = ?',
            values: [body.username],
        }) as any[];
        
        if (existingUserByUsername.length > 0) {
            return {
                status: "fail",
                message: "用户名已存在"
            };
        }
        
        // 检查第三方用户ID是否已存在
        const existingUserByThirdpartyUid = await UserModel.findByThirdpartyUid(thirdpartyUid);
        if (existingUserByThirdpartyUid) {
            return {
                status: "fail",
                message: "该账号已存在"
            };
        }
        
        // 验证channel_code是否在Admins表中存在
        const adminResult = await sql({
            query: 'SELECT id FROM Admins WHERE channel_code = ? AND is_active = 1',
            values: [body.channel_code],
        }) as any[];
        
        if (adminResult.length === 0) {
            return {
                status: "fail",
                message: "无效的渠道代码"
            };
        }
        
        // 验证game_code是否在Games表中存在
        const gameResult = await sql({
            query: 'SELECT id FROM Games WHERE game_code = ? AND is_active = 1',
            values: [body.game_code],
        }) as any[];
        
        if (gameResult.length === 0) {
            return {
                status: "fail",
                message: "无效的游戏代码"
            };
        }
        
        // 准备用户数据
        const userData = {
            username: body.username.trim(),
            password: body.password,
            iphone: body.iphone || '',
            channel_code: body.channel_code,
            game_code: body.game_code,
            thirdparty_uid: thirdpartyUid,
            platform_coins: 0.00
        };
        
        // 插入用户到 Users 表（同时会自动创建一个默认的 SubUser）
        const result = await UserModel.insert(userData);
        
        console.log("用户注册成功:", { userId: result.insertId, thirdpartyUid });
        
        return {
            status: "success",
            message: "注册成功",
            data: {
                user_id: result.insertId,
                thirdparty_uid: thirdpartyUid
            }
        };
        
    } catch (error) {
        console.error('用户注册失败:', error);
        
        // 处理数据库重复键错误
        if (error instanceof Error) {
            if (error.message.includes('Duplicate') && error.message.includes('username')) {
                return {
                    status: "fail",
                    message: "用户名已存在"
                };
            } else if (error.message.includes('Duplicate') && error.message.includes('thirdparty_uid')) {
                return {
                    status: "fail",
                    message: "该账号已存在"
                };
            }
        }
        
        return {
            status: "fail",
            message: "注册失败，请稍后重试"
        };
    }
};

// 封号/解封用户接口（超级管理员专用）
export const banUser = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { user_id, status, admin_id } = body;
        
        console.log("封号/解封用户请求:", body);
        
        // 参数验证
        if (!user_id || status === undefined) {
            return {
                status: "fail",
                message: "缺少用户ID或状态参数"
            };
        }
        
        if (status !== 0 && status !== 1) {
            return {
                status: "fail",
                message: "状态值无效，只能是0（解封）或1（封号）"
            };
        }
        
        // 验证管理员权限（只有超级管理员可以封号）
        if (!admin_id) {
            return {
                status: "fail",
                message: "需要管理员授权"
            };
        }
        
        const admin = await AdminModel.getAdminWithPermissions(admin_id);
        if (!admin || admin.level !== 0) {
            return {
                status: "fail",
                message: "只有超级管理员可以封号用户"
            };
        }
        
        // 更新用户状态
        const result = await UserModel.updateUserStatus(user_id, status);
        
        if (result.success) {
            console.log(`用户状态更新成功: 用户ID=${user_id}, 状态=${status}, 操作员=${admin.name}`);
            return {
                status: "success",
                message: result.message,
                data: {
                    user_id: user_id,
                    status: status,
                    operator: admin.name
                }
            };
        } else {
            return {
                status: "fail",
                message: result.message
            };
        }
    } catch (error) {
        console.error('封号/解封用户失败:', error);
        return {
            status: "fail",
            message: "封号/解封用户失败，请稍后重试"
        };
    }
};

