#!/usr/bin/env node

/**
 * Check for timed-out review slots and release them
 * Usage: node check-review-timeouts.js [--timeout-days=14]
 */

const fs = require('fs').promises;
const path = require('path');

const METADATA_DIR = path.join(__dirname, '..', 'metadata');
const DEFAULT_TIMEOUT_DAYS = 14;

async function getAllSubmissions() {
  const submissions = [];
  const submissionsDir = path.join(METADATA_DIR, 'submissions');
  
  try {
    const yearMonthDirs = await fs.readdir(submissionsDir);
    
    for (const yearMonth of yearMonthDirs) {
      const files = await fs.readdir(path.join(submissionsDir, yearMonth));
      
      for (const file of files) {
        if (!file.startsWith('sub_') || !file.endsWith('.json')) continue;
        
        const submissionPath = path.join(submissionsDir, yearMonth, file);
        const submission = JSON.parse(await fs.readFile(submissionPath, 'utf-8'));
        
        submissions.push({ submission, path: submissionPath });
      }
    }
  } catch (error) {
    // Directory might not exist yet
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  return submissions;
}

async function checkAndReleaseTimeouts(timeoutDays = DEFAULT_TIMEOUT_DAYS) {
  const now = new Date();
  const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
  const submissions = await getAllSubmissions();
  
  let releasedCount = 0;
  const releasedSlots = [];
  
  for (const { submission, path: submissionPath } of submissions) {
    // Only check active submissions
    if (!['under-review', 'pending-revision'].includes(submission.status)) {
      continue;
    }
    
    let modified = false;
    const nowISO = now.toISOString();
    
    for (let i = 0; i < submission.reviewSlots.reviewers.length; i++) {
      const reviewer = submission.reviewSlots.reviewers[i];
      
      // Skip already submitted or expired reviews
      if (reviewer.status === 'submitted' || reviewer.status === 'expired') {
        continue;
      }
      
      const claimedAt = new Date(reviewer.claimedAt);
      const elapsed = now - claimedAt;
      
      if (elapsed > timeoutMs) {
        // Mark as expired
        reviewer.status = 'expired';
        reviewer.expiredAt = nowISO;
        submission.reviewSlots.filled -= 1;
        
        // Add to history
        if (!submission.reviewSlots.history) {
          submission.reviewSlots.history = [];
        }
        submission.reviewSlots.history.push({
          userId: reviewer.userId,
          action: 'timeout_release',
          timestamp: nowISO
        });
        
        // Add to timelines
        if (!submission.timelines) {
          submission.timelines = [];
        }
        submission.timelines.push({
          event: 'review_slot_timeout',
          timestamp: nowISO,
          actor: 'system',
          details: { 
            reviewer: reviewer.userId,
            claimedAt: reviewer.claimedAt,
            daysElapsed: Math.floor(elapsed / (24 * 60 * 60 * 1000))
          }
        });
        
        modified = true;
        releasedCount++;
        releasedSlots.push({
          submission: submission.title,
          reviewer: reviewer.userId,
          prNumber: submission.prNumber
        });
      }
    }
    
    if (modified) {
      submission.updatedAt = nowISO;
      await fs.writeFile(submissionPath, JSON.stringify(submission, null, 2));
    }
  }
  
  return { releasedCount, releasedSlots };
}

async function main() {
  const timeoutArg = process.argv.find(arg => arg.startsWith('--timeout-days='));
  const timeoutDays = timeoutArg 
    ? parseInt(timeoutArg.split('=')[1], 10) 
    : DEFAULT_TIMEOUT_DAYS;
  
  try {
    console.log(`Checking for review slots timed out after ${timeoutDays} days...`);
    
    const { releasedCount, releasedSlots } = await checkAndReleaseTimeouts(timeoutDays);
    
    if (releasedCount === 0) {
      console.log('✓ No timed-out review slots found');
    } else {
      console.log(`✓ Released ${releasedCount} timed-out review slot(s):\n`);
      releasedSlots.forEach(slot => {
        console.log(`  PR #${slot.prNumber}: ${slot.submission}`);
        console.log(`    Reviewer: ${slot.reviewer}\n`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
