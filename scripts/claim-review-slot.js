#!/usr/bin/env node

/**
 * Claim a review slot for a submission
 * Usage: node claim-review-slot.js <submission-id> <github-username>
 */

const fs = require('fs').promises;
const path = require('path');

const METADATA_DIR = path.join(__dirname, '..', 'metadata');

async function findSubmission(submissionId) {
  const submissionsDir = path.join(METADATA_DIR, 'submissions');
  const yearMonthDirs = await fs.readdir(submissionsDir);
  
  for (const yearMonth of yearMonthDirs) {
    const files = await fs.readdir(path.join(submissionsDir, yearMonth));
    
    for (const file of files) {
      if (!file.startsWith('sub_') || !file.endsWith('.json')) continue;
      
      const submissionPath = path.join(submissionsDir, yearMonth, file);
      const submission = JSON.parse(await fs.readFile(submissionPath, 'utf-8'));
      
      if (submission.id === submissionId) {
        return { submission, path: submissionPath };
      }
    }
  }
  
  return null;
}

async function claimSlot(submissionId, githubUsername) {
  const result = await findSubmission(submissionId);
  
  if (!result) {
    throw new Error(`Submission ${submissionId} not found`);
  }
  
  const { submission, path: submissionPath } = result;
  
  // Check if slots are available
  if (submission.reviewSlots.filled >= submission.reviewSlots.total) {
    throw new Error('All review slots are filled');
  }
  
  // Check if user already claimed a slot
  const alreadyClaimed = submission.reviewSlots.reviewers.some(
    r => r.userId === githubUsername
  );
  
  if (alreadyClaimed) {
    throw new Error('User already claimed a slot for this submission');
  }
  
  // Claim the slot
  const now = new Date().toISOString();
  submission.reviewSlots.reviewers.push({
    userId: githubUsername,
    claimedAt: now,
    status: 'claimed'
  });
  submission.reviewSlots.filled += 1;
  
  // Add to history
  if (!submission.reviewSlots.history) {
    submission.reviewSlots.history = [];
  }
  submission.reviewSlots.history.push({
    userId: githubUsername,
    action: 'claim',
    timestamp: now
  });
  
  // Update timelines
  if (!submission.timelines) {
    submission.timelines = [];
  }
  submission.timelines.push({
    event: 'review_slot_claimed',
    timestamp: now,
    actor: githubUsername,
    details: { slotNumber: submission.reviewSlots.filled }
  });
  
  submission.updatedAt = now;
  
  // Write back
  await fs.writeFile(submissionPath, JSON.stringify(submission, null, 2));
  
  return submission;
}

async function main() {
  const submissionId = process.argv[2];
  const username = process.argv[3];
  
  if (!submissionId || !username) {
    console.error('Usage: node claim-review-slot.js <submission-id> <github-username>');
    process.exit(1);
  }
  
  try {
    const submission = await claimSlot(submissionId, username);
    console.log(`✓ Review slot claimed successfully`);
    console.log(`  Submission: ${submission.title}`);
    console.log(`  Reviewer: ${username}`);
    console.log(`  Slots filled: ${submission.reviewSlots.filled}/${submission.reviewSlots.total}`);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
