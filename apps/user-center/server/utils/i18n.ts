// 繁体中文语言包
const zhTW = {
  "sdk": {
    "login": {
      "success": "登入成功",
      "failed": "登入失敗",
      "invalid_credentials": "用戶名或密碼錯誤",
      "missing_credentials": "用戶名和密碼不能為空",
      "system_error": "系統錯誤"
    },
    "sub_account": {
      "list_success": "獲取子帳號列表成功",
      "list_failed": "獲取子帳號列表失敗",
      "add_success": "添加子帳號成功",
      "add_failed": "添加子帳號失敗",
      "edit_success": "編輯子帳號成功",
      "edit_failed": "編輯子帳號失敗",
      "username_required": "用戶名不能為空",
      "nickname_required": "暱稱不能為空",
      "user_not_found": "用戶不存在",
      "sub_account_exists": "子帳號已存在",
      "invalid_nickname": "暱稱格式不正確"
    },
    "payment": {
      "get_payment_methods_success": "獲取支付方式成功",
      "get_payment_methods_failed": "獲取支付方式失敗",
      "invalid_amount": "充值金額必須大於0",
      "payment_success": "支付成功",
      "payment_failed": "支付失敗",
      "order_not_found": "訂單不存在",
      "system_error": "系統錯誤"
    },
    "role": {
      "report_success": "角色上報成功",
      "report_failed": "角色上報失敗",
      "missing_params": "缺少必要參數"
    },
    "log": {
      "report_success": "日誌上報成功",
      "report_failed": "日誌上報失敗"
    }
  }
}

// 语言类型
export type Language = 'zh-TW'

// 获取语言包
export function getLocale(lang: Language = 'zh-TW') {
  switch (lang) {
    case 'zh-TW':
      return zhTW
    default:
      return zhTW
  }
}

// 获取嵌套对象的值
export function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.')
  let result = obj
  
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key]
    } else {
      return path // 如果找不到，返回原始路径
    }
  }
  
  return typeof result === 'string' ? result : path
}

// 获取翻译文本
export function translate(path: string, lang: Language = 'zh-TW'): string {
  const locale = getLocale(lang)
  return getNestedValue(locale, path)
}

// SDK API 消息翻译
export const sdkMessages = {
  login: {
    success: () => translate('sdk.login.success'),
    failed: () => translate('sdk.login.failed'),
    invalidCredentials: () => translate('sdk.login.invalid_credentials'),
    missingCredentials: () => translate('sdk.login.missing_credentials'),
    systemError: () => translate('sdk.login.system_error')
  },
  subAccount: {
    listSuccess: () => translate('sdk.sub_account.list_success'),
    listFailed: () => translate('sdk.sub_account.list_failed'),
    addSuccess: () => translate('sdk.sub_account.add_success'),
    addFailed: () => translate('sdk.sub_account.add_failed'),
    editSuccess: () => translate('sdk.sub_account.edit_success'),
    editFailed: () => translate('sdk.sub_account.edit_failed'),
    usernameRequired: () => translate('sdk.sub_account.username_required'),
    nicknameRequired: () => translate('sdk.sub_account.nickname_required'),
    userNotFound: () => translate('sdk.sub_account.user_not_found'),
    subAccountExists: () => translate('sdk.sub_account.sub_account_exists'),
    invalidNickname: () => translate('sdk.sub_account.invalid_nickname')
  },
  payment: {
    getPaymentMethodsSuccess: () => translate('sdk.payment.get_payment_methods_success'),
    getPaymentMethodsFailed: () => translate('sdk.payment.get_payment_methods_failed'),
    invalidAmount: () => translate('sdk.payment.invalid_amount'),
    paymentSuccess: () => translate('sdk.payment.payment_success'),
    paymentFailed: () => translate('sdk.payment.payment_failed'),
    orderNotFound: () => translate('sdk.payment.order_not_found'),
    systemError: () => translate('sdk.payment.system_error')
  },
  role: {
    reportSuccess: () => translate('sdk.role.report_success'),
    reportFailed: () => translate('sdk.role.report_failed'),
    missingParams: () => translate('sdk.role.missing_params')
  },
  log: {
    reportSuccess: () => translate('sdk.log.report_success'),
    reportFailed: () => translate('sdk.log.report_failed')
  }
} 