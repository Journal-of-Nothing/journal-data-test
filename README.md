# Journal Data Repository

This repository serves as the **data layer** for the Open Journal System. It contains all accepted articles, submission metadata, user records, and automation workflows.

## 🏗️ Repository Structure

```
journal-data/
├── .github/
│   └── workflows/
│       ├── submission-check.yml    # Validates new submissions
│       ├── review-logic.yml        # Manages review slots and timeouts
│       └── publish.yml             # Handles publication workflow
├── posts/
│   └── {journalId}/
│       └── {articleId}.md          # Published articles (main branch only)
├── metadata/
│   ├── schemas/
│   │   ├── submission.json         # Submission data schema
│   │   └── user.json               # User profile schema
│   ├── submissions/
│   │   └── YYYY-MM/
│   │       └── sub_*.json          # Submission records (sharded by month)
│   ├── users/
│   │   └── user_*.json             # User profiles
│   ├── indexes/
│   │   ├── user_submissions.json   # User → submission mapping
│   │   ├── journal_articles.json   # Journal article index
│   │   └── reviewer_stats.json     # Reviewer statistics
│   └── journals/
│       └── {journalId}/
│           └── config.json          # Journal configuration
├── scripts/
│   ├── check-active-submission.js  # Validate one-active-submission rule
│   ├── validate-images.js          # Check image URLs
│   ├── claim-review-slot.js        # Manage review slot claiming
│   └── check-review-timeouts.js    # Release timed-out slots
└── package.json                     # Node.js dependencies

```

## 🔄 Workflows

### Submission Workflow

1. **Author submits** → PR created in `posts/{journalId}/`
2. **GitHub Action validates** → Check one-active-submission, images, format
3. **Status label added** → `status-under-review`
4. **Metadata updated** → Submission record created
5. **Reviewers claim slots** → Comments trigger slot assignment
6. **Reviews submitted** → Official reviews marked with `<!-- OFFICIAL_REVIEW -->`
7. **Editor decides** → Label changed to `status-accepted`, `status-rejected`, etc.
8. **PR merged (if accepted)** → Content added to main branch
9. **Metadata finalized** → Indexes updated, site build triggered

### Review Slot Mechanism (萝卜坑)

- **Default slots**: 3 per submission
- **Claiming**: Comment `/claim-review` on the PR
- **Timeout**: 14 days automatic release
- **Release**: Comment `/release-review` to voluntarily exit
- **Cron job**: Daily check for timed-out slots

### Publication Process

When a PR is merged with `status-accepted` label:

1. Article added to `posts/{journalId}/` in main branch
2. Version tagged: `article_{prNumber}_v1`
3. Metadata indexes updated
4. PR comments migrated to Discussions
5. Site rebuild triggered

## 📊 Metadata Structure

### Submission Record (`metadata/submissions/YYYY-MM/sub_*.json`)

```json
{
  "id": "sub_2025_12_001",
  "title": "Paper Title",
  "author": "GitHub Username",
  "status": "under-review",
  "reviewSlots": {
    "total": 3,
    "filled": 1,
    "reviewers": [
      {
        "userId": "reviewer1",
        "claimedAt": "2025-12-09T10:00:00Z",
        "status": "claimed"
      }
    ]
  },
  "prNumber": 42,
  "timelines": [...]
}
```

### User Profile (`metadata/users/user_*.json`)

```json
{
  "userId": "github-username",
  "roles": { "default": ["author", "reviewer"] },
  "activeSubmissionId": "sub_2025_12_001",
  "submissionCount": 5,
  "reviewCount": 12,
  "reputationScore": 4.2
}
```

## 🛠️ Scripts

### Check Active Submission

```bash
node scripts/check-active-submission.js <github-username>
```

Validates the one-active-submission rule.

### Validate Images

```bash
node scripts/validate-images.js <markdown-file-path>
```

Checks image URLs for validity (HEAD request, timeout, blacklist).

### Claim Review Slot

```bash
node scripts/claim-review-slot.js <submission-id> <github-username>
```

Assigns a review slot to a user.

### Check Review Timeouts

```bash
node scripts/check-review-timeouts.js --timeout-days=14
```

Finds and releases timed-out review slots.

## 🔐 Security & Access Control

- **Public repo**: All content is public and version-controlled
- **GitHub Actions**: Use `GITHUB_TOKEN` with minimal permissions
- **No secrets**: No API keys or credentials stored
- **Audit trail**: All actions logged in metadata timelines

## 📝 Status Labels

| Label | Description |
|-------|-------------|
| `status-under-review` | Submission is being reviewed |
| `status-pending-revision` | Author needs to make changes |
| `status-accepted` | Approved for publication |
| `status-rejected` | Not suitable for publication |
| `withdrawn` | Author withdrew submission |
| `errata` | Correction to published article |

## 🤝 Contributing

This repository is managed automatically by the journal system. Manual edits should be avoided except by editors for special cases.

### For Editors

- Use labels to manage submission status
- Manually adjust review slots if needed: edit `metadata/submissions/` files
- Force-release stuck review slots
- Moderate forged official review markers

## 📚 Related Repositories

- **[journal-site](../journal-site)**: Vue 3 front-end for submissions and reviews
- **GitHub Discussions**: Public comments for published articles

## 📞 Support

- [Submission Guidelines](https://your-journal-site.vercel.app/guide/submission)
- [Review Process](https://your-journal-site.vercel.app/guide/review)
- [GitHub Discussions](https://github.com/your-org/journal-data/discussions)

---

**License**: MIT (or your chosen license)
**Maintainers**: Journal Editors
