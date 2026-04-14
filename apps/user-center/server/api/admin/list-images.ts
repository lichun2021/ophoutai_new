/**
 * 列出指定目录的图片文件
 */

import { defineEventHandler, createError, getHeader } from 'h3';
import { readdir, stat } from 'fs/promises';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import * as AdminModel from '../../model/admin';
import { getImageDirectory, generateImageUrl } from '../../config/upload';

export default defineEventHandler(async (event) => {
  // 权限验证 - 只允许超级管理员访问
  const authorizationHeader = getHeader(event, 'authorization');
  const token = authorizationHeader ? parseInt(authorizationHeader) : null;
  
  if (!token) {
    throw createError({
      status: 401,
      message: '未提供认证token',
    });
  }
  
  const adminInfo = await AdminModel.getAdminWithPermissions(token);
  if (!adminInfo || adminInfo.level !== 0) {
    throw createError({
      status: 403,
      message: '只有超级管理员可以查看图片列表',
    });
  }

  try {
    const imageDir = await getImageDirectory();

    // 检查目录是否存在
    if (!existsSync(imageDir)) {
      return {
        code: 200,
        data: {
          images: [],
          total: 0,
          directory: imageDir,
          message: '图片目录不存在'
        }
      };
    }

    // 读取目录中的所有文件
    const files = await readdir(imageDir);
    
    // 过滤图片文件并获取详细信息
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageFiles = await Promise.all(
      files
        .filter(file => {
          const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
          return imageExtensions.includes(ext);
        })
        .map(async (file) => {
          const filePath = resolve(imageDir, file);
          const stats = await stat(filePath);
          
          // 生成完整URL（资源域名 + URL前缀 + 文件名）
          const fullUrl = await generateImageUrl(file);
          
          return {
            filename: file,
            url: fullUrl,
            size: stats.size,
            modifiedAt: stats.mtime
          };
        })
    );

    // 按修改时间倒序排列
    imageFiles.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    return {
      code: 200,
      data: {
        images: imageFiles,
        total: imageFiles.length,
        directory: imageDir
      }
    };

  } catch (error: any) {
    console.error('获取图片列表失败:', error);
    throw createError({
      status: error.status || 500,
      message: error.message || '获取图片列表失败',
    });
  }
});

