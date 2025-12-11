#!/usr/bin/env node
/**
 * 管理员清理脚本 - 删除测试投稿
 * 
 * 用法：
 *   node scripts/admin-cleanup.js <submissionId> [--dry-run]
 * 
 * 示例：
 *   node scripts/admin-cleanup.js sub_2025_12_XXN          # 执行删除
 *   node scripts/admin-cleanup.js sub_2025_12_XXN --dry-run # 预览删除（不实际执行）
 * 
 * 功能：
 *   1. 删除投稿元数据文件
 *   2. 更新作者用户元数据（清除 activeSubmissionId）
 *   3. 删除投稿分支（需要 GitHub token）
 *   4. 关闭对应 PR（需要 GitHub token）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function parseSubmissionId(submissionId) {
  const match = submissionId.match(/^sub_(\d{4})_(\d{2})_\w+$/)
  if (!match) return null
  return { year: match[1], month: match[2] }
}

function getSubmissionPath(submissionId) {
  const parsed = parseSubmissionId(submissionId)
  if (!parsed) throw new Error(`Invalid submission ID format: ${submissionId}`)
  return path.join(ROOT_DIR, 'metadata', 'submissions', `${parsed.year}-${parsed.month}`, `${submissionId}.json`)
}

function getUserPath(userId) {
  return path.join(ROOT_DIR, 'metadata', 'users', `${userId}.json`)
}

async function closePRAndDeleteBranch(submissionId, prNumber, branchName, token) {
  if (!token) {
    log('⚠️  未提供 GITHUB_TOKEN，跳过 PR 关闭和分支删除', 'yellow')
    log(`   请手动关闭 PR: https://github.com/Journal-of-Nothing/journal-data-test/pull/${prNumber}`, 'yellow')
    log(`   请手动删除分支: ${branchName}`, 'yellow')
    return false
  }

  const owner = 'Journal-of-Nothing'
  const repo = 'journal-data-test'

  try {
    // Close PR
    log(`正在关闭 PR #${prNumber}...`, 'cyan')
    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      }
    )

    if (prResponse.ok) {
      log(`✓ PR #${prNumber} 已关闭`, 'green')
    } else {
      const error = await prResponse.json()
      log(`✗ 关闭 PR 失败: ${error.message || prResponse.status}`, 'red')
    }

    // Delete branch
    log(`正在删除分支 ${branchName}...`, 'cyan')
    const branchResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (branchResponse.ok || branchResponse.status === 422) {
      log(`✓ 分支 ${branchName} 已删除`, 'green')
    } else {
      const error = await branchResponse.json().catch(() => ({}))
      log(`✗ 删除分支失败: ${error.message || branchResponse.status}`, 'red')
    }

    return true
  } catch (error) {
    log(`✗ GitHub API 错误: ${error.message}`, 'red')
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.cyan}管理员清理脚本 - 删除测试投稿${colors.reset}

用法：
  node scripts/admin-cleanup.js <submissionId> [options]

参数：
  submissionId    投稿 ID，例如 sub_2025_12_XXN

选项：
  --dry-run       预览模式，不实际执行删除
  --force         强制删除，不需要确认
  --help, -h      显示帮助信息

环境变量：
  GITHUB_TOKEN    GitHub Personal Access Token（用于关闭 PR 和删除分支）

示例：
  node scripts/admin-cleanup.js sub_2025_12_XXN
  node scripts/admin-cleanup.js sub_2025_12_XXN --dry-run
  GITHUB_TOKEN=xxx node scripts/admin-cleanup.js sub_2025_12_XXN
`)
    process.exit(0)
  }

  const submissionId = args.find(arg => arg.startsWith('sub_'))
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const token = process.env.GITHUB_TOKEN

  if (!submissionId) {
    log('✗ 请提供投稿 ID (例如: sub_2025_12_XXN)', 'red')
    process.exit(1)
  }

  log(`\n${'='.repeat(50)}`, 'cyan')
  log(`  投稿清理工具 ${dryRun ? '(预览模式)' : ''}`, 'cyan')
  log(`${'='.repeat(50)}\n`, 'cyan')

  // 1. Read submission metadata
  const submissionPath = getSubmissionPath(submissionId)
  log(`检查投稿文件: ${submissionPath}`, 'blue')

  if (!fs.existsSync(submissionPath)) {
    log(`✗ 投稿文件不存在: ${submissionPath}`, 'red')
    process.exit(1)
  }

  const submission = JSON.parse(fs.readFileSync(submissionPath, 'utf-8'))
  log(`✓ 找到投稿: "${submission.title}"`, 'green')
  log(`  - 作者: ${submission.authorDisplayName} (@${submission.authorGithubUsername})`, 'reset')
  log(`  - PR: #${submission.prNumber}`, 'reset')
  log(`  - 分支: ${submission.branchName}`, 'reset')
  log(`  - 状态: ${submission.status}`, 'reset')

  // 2. Find author user file
  const userPath = getUserPath(submission.authorId)
  let user = null
  
  if (fs.existsSync(userPath)) {
    user = JSON.parse(fs.readFileSync(userPath, 'utf-8'))
    log(`✓ 找到用户文件: ${userPath}`, 'green')
    log(`  - activeSubmissionId: ${user.activeSubmissionId || 'null'}`, 'reset')
  } else {
    log(`⚠️  用户文件不存在: ${userPath}`, 'yellow')
  }

  // 3. Confirm deletion
  if (!dryRun && !force) {
    log(`\n⚠️  即将执行以下操作:`, 'yellow')
    log(`  1. 删除投稿元数据文件`, 'reset')
    if (user && user.activeSubmissionId === submissionId) {
      log(`  2. 更新用户元数据 (清除 activeSubmissionId)`, 'reset')
    }
    if (token) {
      log(`  3. 关闭 PR #${submission.prNumber}`, 'reset')
      log(`  4. 删除分支 ${submission.branchName}`, 'reset')
    }
    
    log(`\n请输入 'yes' 确认删除，或按 Ctrl+C 取消:`, 'yellow')
    
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await new Promise(resolve => {
      rl.question('> ', resolve)
    })
    rl.close()

    if (answer.toLowerCase() !== 'yes') {
      log('已取消操作', 'yellow')
      process.exit(0)
    }
  }

  if (dryRun) {
    log(`\n[预览模式] 将执行以下操作:`, 'yellow')
    log(`  1. 删除文件: ${submissionPath}`, 'reset')
    if (user && user.activeSubmissionId === submissionId) {
      log(`  2. 更新文件: ${userPath} (设置 activeSubmissionId = null)`, 'reset')
    }
    if (token) {
      log(`  3. GitHub API: 关闭 PR #${submission.prNumber}`, 'reset')
      log(`  4. GitHub API: 删除分支 ${submission.branchName}`, 'reset')
    } else {
      log(`  ⚠️ 未设置 GITHUB_TOKEN，跳过 PR 和分支操作`, 'yellow')
    }
    log(`\n[预览完成] 使用不带 --dry-run 参数执行实际删除`, 'green')
    process.exit(0)
  }

  // 4. Execute deletion
  log(`\n开始执行删除...`, 'cyan')

  // Delete submission metadata
  fs.unlinkSync(submissionPath)
  log(`✓ 删除投稿元数据: ${submissionPath}`, 'green')

  // Update user metadata
  if (user && user.activeSubmissionId === submissionId) {
    user.activeSubmissionId = null
    if (user.submissionCount > 0) {
      user.submissionCount -= 1
    }
    user.updatedAt = new Date().toISOString()
    fs.writeFileSync(userPath, JSON.stringify(user, null, 2))
    log(`✓ 更新用户元数据: activeSubmissionId = null`, 'green')
  }

  // Close PR and delete branch via GitHub API
  await closePRAndDeleteBranch(
    submissionId,
    submission.prNumber,
    submission.branchName,
    token
  )

  log(`\n${'='.repeat(50)}`, 'green')
  log(`  清理完成！`, 'green')
  log(`${'='.repeat(50)}`, 'green')

  if (!token) {
    log(`\n提示: 设置 GITHUB_TOKEN 环境变量可自动关闭 PR 和删除分支`, 'yellow')
    log(`  export GITHUB_TOKEN=your_token`, 'yellow')
  }

  log(`\n记得提交并推送更改:`, 'blue')
  log(`  git add -A && git commit -m "cleanup: 删除测试投稿 ${submissionId}" && git push`, 'reset')
}

main().catch(error => {
  log(`\n✗ 错误: ${error.message}`, 'red')
  process.exit(1)
})
