import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const xmlPath = join(__dirname, 'item.xml');
const outPath = join(__dirname, 'itemConfig.json');

const xml = readFileSync(xmlPath, 'utf-8');

// 提取所有 <item>...</item> 块
const itemPattern = /<item>([\s\S]*?)<\/item>/g;
const fieldPattern = (tag) => new RegExp(`<${tag}>([^<]*)<\/${tag}>`);

const result = {};  // gid -> name（同 gid 多 level 时取 level=1 或首个）

let match;
while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];

    const gidMatch = fieldPattern('gid').exec(block);
    const nameMatch = fieldPattern('name').exec(block);
    const levelMatch = fieldPattern('level').exec(block);

    if (!gidMatch || !nameMatch) continue;

    const gid = gidMatch[1].trim();
    const name = nameMatch[1].trim();
    const level = levelMatch ? levelMatch[1].trim() : '1';

    if (!gid || !name) continue;

    // 同 gid 优先保留 level=1 的名称；若尚未记录则直接写入
    if (!result[gid]) {
        result[gid] = name;
    } else if (level === '1') {
        result[gid] = name;
    }
}

const total = Object.keys(result).length;
writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
console.log(`✅ 完成！共导出 ${total} 条记录 → ${outPath}`);
