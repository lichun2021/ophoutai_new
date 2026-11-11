import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createError, getMethod, getRouterParam, setHeader, sendStream, type H3Event } from 'h3';

// 与后台图片列表允许的文件类型保持一致。
const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const notFound = () => createError({ statusCode: 404, statusMessage: 'Image not found' });

export async function serveImage(event: H3Event): Promise<void> {
  const method = getMethod(event);
  if (method !== 'GET' && method !== 'HEAD') {
    setHeader(event, 'Allow', 'GET, HEAD');
    throw createError({ statusCode: 405, statusMessage: 'Method not allowed' });
  }

  let filename: string;
  try {
    filename = decodeURIComponent(getRouterParam(event, 'path') || '');
  } catch {
    throw notFound();
  }
  if (!filename || filename.includes('\0') || filename.includes('\\') || path.isAbsolute(filename)
    || filename.split('/').some(part => part === '.' || part === '..')) {
    throw notFound();
  }
  const contentType = IMAGE_TYPES[path.extname(filename).toLowerCase()];
  if (!contentType) throw notFound();

  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const directory = await realpath(process.env.IMAGE_DIRECTORY || '/data/images');
    const resolved = await realpath(path.join(directory, filename));
    const relative = path.relative(directory, resolved);
    if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
      throw notFound();
    }
    file = await open(resolved, 'r');
    const stat = await file.stat();
    if (!stat.isFile()) throw notFound();

    setHeader(event, 'Content-Type', contentType);
    setHeader(event, 'Content-Length', stat.size);
    setHeader(event, 'X-Content-Type-Options', 'nosniff');
    if (method === 'HEAD') {
      await file.close();
      file = undefined;
      event.node.res.end();
      return;
    }
    const stream = file.createReadStream();
    file = undefined; // 文件由流结束或销毁时关闭。
    await sendStream(event, stream);
  } catch {
    if (file) await file.close().catch(() => {});
    throw notFound();
  }
}
