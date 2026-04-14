export interface AppConfig {

   
    thirdPartyConfig: {
        gameCode: string;
        accessKey: string;
        sApi: string;
        pApi: string;
    };
    // 新增数据库配置

}

export const config: AppConfig = {

    thirdPartyConfig: {
        accessKey:"MQhixnAZWxSKWfo5gMymp",
        gameCode:"hzwqh",
        sApi:"/prod-api/getInfo",
        pApi:"/prod-api/pay/gameOrder/addOrder",
    }
};



