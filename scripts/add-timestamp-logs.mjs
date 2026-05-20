/**
 * 批量给 payment.ts 中所有 console.log/error/warn 加北京时间时间戳
 * 使用方式: node scripts/add-timestamp-logs.mjs <文件路径>
 *
 * 规则：
 * 1. 跳过已含 bjTimeStr / requestId / [Pay] 的行
 * 2. 在 console.xxx( 后插入 `[${bjTimeStr}] ` 前缀
 * 3. 若函数体开头没有 bjTimeStr 声明则在函数第一个 const/let 之前插入
 */

import { readFileSync, writeFileSync } from 'fs';

const filePath = process.argv[2];
if (!filePath) { console.error('用法: node add-timestamp-logs.mjs <文件>'); process.exit(1); }

let src = readFileSync(filePath, 'utf8');

// 北京时间表达式（固定用这个，避免重复声明）
const BJ_EXPR = `new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 23)`;
const BJ_DECL = `const bjTimeStr = ${BJ_EXPR};`;

// ─── Step 1: 给所有 console.log/error/warn 加 [${bjTimeStr}] 前缀 ─────────────
// 匹配规则：console.(log|error|warn)(`... 或 console.(log|error|warn)('... 或 console.(log|error|warn)("...
// 且该行不含 bjTimeStr / requestId
src = src.replace(
    /^(\s*console\.(log|error|warn)\()(`.+?`|'[^']*'|"[^"]*")/gm,
    (match, prefix, method, firstArg) => {
        // 跳过已有时间的行
        if (match.includes('bjTimeStr') || match.includes('requestId') || match.includes('[Pay]')) {
            return match;
        }

        // 把第一个字符串参数前面插入时间前缀
        // 模板字符串：`xxx` → `[${bjTimeStr}] xxx`
        if (firstArg.startsWith('`')) {
            const inner = firstArg.slice(1, -1);
            return `${prefix}\`[\${bjTimeStr}] ${inner}\``;
        }
        // 普通字符串：'xxx' 或 "xxx" → 转成模板字符串并加前缀
        const inner = firstArg.slice(1, -1).replace(/`/g, '\\`').replace(/\$/g, '\\$');
        return `${prefix}\`[\${bjTimeStr}] ${inner}\``;
    }
);

// ─── Step 2: 确保每个 export const/async function 函数体开头有 bjTimeStr 声明 ──
// 找到函数体 { 开始，若接下来没有 bjTimeStr 声明就插入一行
// 用简单的行扫描：在函数第一个 `try {` 或第一个 `const ` 之前插入（若整个函数体没有 bjTimeStr）
const lines = src.split('\n');
const result = [];
let i = 0;

while (i < lines.length) {
    const line = lines[i];

    // 检测函数体开始：export const xxx = async (evt...) => {
    const isFuncStart = /^\s*export\s+const\s+\w+\s*=\s*(?:async\s*)?\(/.test(line) ||
                        /^\s*export\s+async\s+function\s+\w+/.test(line);

    if (isFuncStart) {
        result.push(line);
        i++;

        // 找到函数体 {
        let braceFound = line.includes('{');
        while (i < lines.length && !braceFound) {
            result.push(lines[i]);
            if (lines[i].includes('{')) braceFound = true;
            i++;
        }

        // 收集函数体内容直到匹配的 }
        let depth = 1;
        const body = [];
        while (i < lines.length && depth > 0) {
            const l = lines[i];
            for (const ch of l) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
            }
            body.push(l);
            i++;
        }

        // 检查整个函数体是否已有 bjTimeStr
        const bodyStr = body.join('\n');
        if (bodyStr.includes('bjTimeStr')) {
            result.push(...body);
        } else {
            // 在函数体第一个非空行前插入声明（缩进与下一行对齐）
            let inserted = false;
            for (let j = 0; j < body.length; j++) {
                if (!inserted && body[j].trim() !== '') {
                    const indent = body[j].match(/^(\s*)/)[1];
                    result.push(`${indent}${BJ_DECL}`);
                    inserted = true;
                }
                result.push(body[j]);
            }
        }
        continue;
    }

    result.push(line);
    i++;
}

writeFileSync(filePath, result.join('\n'), 'utf8');
console.log(`✅ 处理完成: ${filePath}`);
