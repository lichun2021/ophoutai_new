/**
 * 图片目录配置
 * 从 SystemParams 表读取配置
 */

import { getSystemParam } from '../utils/systemConfig';

export interface ImageConfig {
  // 图片目录（绝对路径）
  imageDirectory: string;
  // 访问URL前缀
  urlPrefix: string;
  // 资源域名
  resourceDomain: string;
}

// 默认配置（作为后备）
const defaultImageDirectory = process.env.IMAGE_DIRECTORY || '/www/wwwroot/update.kccyei.cn/images';
const defaultUrlPrefix = process.env.IMAGE_URL_PREFIX || '/images';
const defaultResourceDomain = process.env.RESOURCE_DOMAIN || 'https://update.kccyei.cn';

// 获取图片目录路径（从系统参数读取）
export async function getImageDirectory(): Promise<string> {
  return await getSystemParam('image_directory', defaultImageDirectory);
}

// 获取图片URL前缀（从系统参数读取）
export async function getImageUrlPrefix(): Promise<string> {
  return await getSystemParam('image_url_prefix', defaultUrlPrefix);
}

// 获取资源域名（从系统参数读取）
export async function getResourceDomain(): Promise<string> {
  return await getSystemParam('resource_domain', defaultResourceDomain);
}

// 生成完整的图片URL（资源域名 + URL前缀 + 文件名）
export async function generateImageUrl(filename: string): Promise<string> {
  const domain = await getResourceDomain();
  const prefix = await getImageUrlPrefix();

  // 确保域名不以 / 结尾
  const cleanDomain = domain.replace(/\/$/, '');
  // 确保前缀以 / 开头
  const cleanPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  // 确保前缀不以 / 结尾
  const finalPrefix = cleanPrefix.replace(/\/$/, '');

  return `${cleanDomain}${finalPrefix}/${filename}`;
}

