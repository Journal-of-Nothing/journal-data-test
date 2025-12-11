#!/usr/bin/env node

/**
 * Check if a user has an active submission (under-review or pending-revision)
 * Usage: node check-active-submission.js <github-username>
 */

const fs = require('fs').promises;
const path = require('path');

const METADATA_DIR = path.join(__dirname, '..', 'metadata');

async function getUserActiveSubmission(githubUsername) {
  try {
    // Check user_submissions index
    const indexPath = path.join(METADATA_DIR, 'indexes', 'user_submissions.json');
    const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    
    const userSubmission = indexData.index[githubUsername];
    if (!userSubmission || !userSubmission.activeSubmissionId) {
      return null;
    }
    
    // Find the submission details
    const submissionsDir = path.join(METADATA_DIR, 'submissions');
    const yearMonthDirs = await fs.readdir(submissionsDir);
    
    for (const yearMonth of yearMonthDirs) {
      const files = await fs.readdir(path.join(submissionsDir, yearMonth));
      
      for (const file of files) {
        if (!file.startsWith('sub_') || !file.endsWith('.json')) continue;
        
        const submissionPath = path.join(submissionsDir, yearMonth, file);
        const submission = JSON.parse(await fs.readFile(submissionPath, 'utf-8'));
        
        if (submission.id === userSubmission.activeSubmissionId) {
          if (['under-review', 'pending-revision'].includes(submission.status)) {
            return submission;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking active submission:', error.message);
    return null;
  }
}

async function main() {
  const username = process.argv[2];
  
  if (!username) {
    console.error('Usage: node check-active-submission.js <github-username>');
    process.exit(1);
  }
  
  const activeSubmission = await getUserActiveSubmission(username);
  
  if (activeSubmission) {
    console.error(`Error: User ${username} already has an active submission:`);
    console.error(`  Title: ${activeSubmission.title}`);
    console.error(`  Status: ${activeSubmission.status}`);
    console.error(`  PR: #${activeSubmission.prNumber}`);
    process.exit(1);
  } else {
    console.log(`✓ User ${username} has no active submissions`);
    process.exit(0);
  }
}

main();
