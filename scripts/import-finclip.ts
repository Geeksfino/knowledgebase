#!/usr/bin/env bun
/**
 * FinClip 文档批量导入脚本
 * 
 * 将 data/finclip 目录下的 markdown 文件批量导入到知识库中
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, dirname, relative, extname } from 'path';

const KB_URL = process.env.KB_URL || 'http://localhost:8080';
const DATA_DIR = join(import.meta.dirname, '..', 'data', 'finclip');

interface ImportResult {
  file: string;
  success: boolean;
  documentId?: string;
  chunksCount?: number;
  error?: string;
}

interface DocumentUploadResponse {
  document_id: string;
  status: 'indexed' | 'failed';
  chunks_count?: number;
  message?: string;
}

/**
 * 递归获取目录下所有 markdown 文件
 */
async function getMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过 images 和 media 目录
        if (entry.name === 'images' || entry.name === 'media') {
          continue;
        }
        const subFiles = await getMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

/**
 * 根据文件路径生成分类
 */
function getCategoryFromPath(filePath: string): string {
  const relativePath = relative(DATA_DIR, filePath);
  const parts = relativePath.split('/');
  
  if (parts.length > 1) {
    // 返回第一级目录作为主分类
    return parts[0];
  }
  
  return 'finclip';
}

/**
 * 根据文件路径生成描述
 */
function getDescriptionFromPath(filePath: string): string {
  const relativePath = relative(DATA_DIR, filePath);
  const dir = dirname(relativePath);
  
  if (dir && dir !== '.') {
    return `FinClip 文档: ${dir}`;
  }
  
  return 'FinClip 文档';
}

/**
 * 上传单个文档
 */
async function uploadDocument(
  filePath: string,
  title: string,
  content: string,
  category: string,
  description: string
): Promise<DocumentUploadResponse> {
  const response = await fetch(`${KB_URL}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      content,
      category,
      description,
      metadata: {
        source: 'finclip',
        file_path: relative(DATA_DIR, filePath),
        imported_at: new Date().toISOString(),
      },
    }),
    // 设置 300 秒超时，因为中文模型处理较慢，需要更长等待时间
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * 从 markdown 内容中提取标题
 */
function extractTitle(content: string, filename: string): string {
  // 尝试从第一个 # 标题提取
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  
  // 使用文件名（去除扩展名）
  return basename(filename, '.md');
}

/**
 * 导入单个文件
 */
async function importFile(filePath: string): Promise<ImportResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const filename = basename(filePath);
    const title = extractTitle(content, filename);
    const category = getCategoryFromPath(filePath);
    const description = getDescriptionFromPath(filePath);

    // 跳过空文件或太短的文件
    if (content.trim().length < 50) {
      return {
        file: filePath,
        success: false,
        error: 'Content too short (< 50 chars)',
      };
    }

    const result = await uploadDocument(filePath, title, content, category, description);

    return {
      file: filePath,
      success: result.status === 'indexed',
      documentId: result.document_id,
      chunksCount: result.chunks_count,
      error: result.status === 'failed' ? result.message : undefined,
    };
  } catch (error) {
    return {
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始导入 FinClip 文档...\n');
  console.log(`📁 数据目录: ${DATA_DIR}`);
  console.log(`🔗 知识库地址: ${KB_URL}\n`);

  // 检查服务是否可用
  try {
    const healthResponse = await fetch(`${KB_URL}/provider/health`);
    if (!healthResponse.ok) {
      console.error('❌ 知识库服务不可用');
      process.exit(1);
    }
    const health = await healthResponse.json();
    console.log(`✅ 知识库服务状态: ${health.status}`);
    console.log(`   txtai 可用: ${health.txtai?.available}`);
    console.log(`   现有文档数: ${health.documents?.count}\n`);
  } catch (error) {
    console.error('❌ 无法连接到知识库服务:', error);
    process.exit(1);
  }

  // 获取所有 markdown 文件
  console.log('📂 扫描 markdown 文件...');
  const files = await getMarkdownFiles(DATA_DIR);
  console.log(`   找到 ${files.length} 个 markdown 文件\n`);

  if (files.length === 0) {
    console.log('⚠️  没有找到需要导入的文件');
    return;
  }

  // 导入文件
  const results: ImportResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let totalChunks = 0;

  console.log('📥 开始导入文档...\n');
  
  // 使用并发控制，避免同时发送太多请求
  // 增加并发数以提高导入速度
  const batchSize = 5;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(`正在处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}...`);
    const batchResults = await Promise.all(batch.map(importFile));
    
    for (const result of batchResults) {
      results.push(result);
      
      const relativePath = relative(DATA_DIR, result.file);
      if (result.success) {
        successCount++;
        totalChunks += result.chunksCount || 0;
        console.log(`✅ [${successCount + failCount}/${files.length}] ${relativePath}`);
        console.log(`   └─ 文档ID: ${result.documentId}, 分块数: ${result.chunksCount}`);
      } else {
        failCount++;
        console.log(`❌ [${successCount + failCount}/${files.length}] ${relativePath}`);
        console.log(`   └─ 错误: ${result.error}`);
      }
    }

    // 批次之间无需延迟，让服务端队列控制流速
  }

  // 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('📊 导入统计');
  console.log('='.repeat(60));
  console.log(`   总文件数: ${files.length}`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log(`   总分块数: ${totalChunks}`);
  console.log('='.repeat(60));

  // 输出失败列表
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ 失败的文件:');
    for (const f of failed) {
      console.log(`   - ${relative(DATA_DIR, f.file)}: ${f.error}`);
    }
  }

  console.log('\n✨ 导入完成!');
}

main().catch(console.error);

