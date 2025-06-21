# Release Guide

This document explains how releases are managed in this repository using Release Please automation with label-based version control.

## Release Automation

This repository uses [Release Please](https://github.com/googleapis/release-please) to automate the release process. Version bumps are controlled by pull request labels rather than conventional commits.

## Label-Based Version Control

### Version Bumping Rules

Version bumps are determined by pull request labels:

| PR Label | Example | Version Impact |
|----------|---------|----------------|
| `minor` or `feature` | PR labeled with "minor" or "feature" | **Minor** (0.1.2 → 0.2.0) |
| `major` | PR labeled with "major" | **Major** (0.1.2 → 1.0.0) |
| No label (default) | PR without version labels | **Patch** (0.1.2 → 0.1.3) |

**Key Points:**
- **Default behavior**: All PRs create patch version bumps
- **Minor bumps**: Add `minor` or `feature` label to the PR
- **Major bumps**: Add `major` label to the PR
- **No conventional commits required**: Any commit format works

## Release Process

### 1. Create Feature PR with Labels

When creating a pull request:

1. Choose appropriate label based on change type:
   - No label = patch version (bug fixes, small improvements)
   - `minor` or `feature` = minor version (new features)
   - `major` = major version (breaking changes)

### 2. Automatic Version Bump Handling

When a PR is merged to `main`:

1. **Version Bump Workflow** checks PR labels
2. For non-patch bumps, creates a Release-As commit
3. **Release Please Workflow** detects the commit and version bump
4. Creates a release pull request with:
   - Updated `package.json` version
   - Generated `CHANGELOG.md` entries
   - Updated version references in documentation

### 3. Review and Merge Release PR

1. Review the generated release PR
2. Verify the changelog entries
3. Merge the PR when ready to release

### 4. Automatic Tag Creation

After merging the release PR, Release Please automatically:

1. Creates a Git tag (e.g., `v0.1.3`)
2. Runs build and tests
3. **No GitHub release created** (tags only)

## Manual Version Override

To force a specific version, include in your commit message:

```
chore: prepare for major release

Release-As: 2.0.0
```

## Files Updated Automatically

The following files have their version references updated automatically:

- `package.json` - Main package version
- `CHANGELOG.md` - Release history
- `README.md` - Version badge
- `servers/file-mcp/README.md` - Installation examples
- `CLAUDE.md` - Development examples

## Best Practices

### PR Labeling

```bash
# For new features (minor version bump)
Add label: "minor" or "feature"

# For breaking changes (major version bump)  
Add label: "major"

# For bug fixes, docs, refactoring (patch version bump)
No label needed (default behavior)
```

### Commit Messages

Since version control is label-based, any commit format works:

```bash
# All of these are acceptable
git commit -m "add copy operation to file server"
git commit -m "fix: handle permission errors gracefully"  
git commit -m "update documentation"
git commit -m "refactor code structure"
```

## Release Schedule

- **Patch releases**: As needed for bug fixes
- **Minor releases**: For new features
- **Major releases**: For breaking changes (planned releases)

## Troubleshooting

### Release PR Not Created

1. Check that commits contain actual changes worth releasing
2. Verify the Release Please workflow is enabled
3. Ensure the merged PR had appropriate labels if non-patch bump was expected

### Incorrect Version Bump

1. Review PR labels for correct version bump type
2. Use `Release-As:` footer to override version in commit message
3. Edit the release PR manually if needed

### Failed Release

1. Check CI/CD pipeline status
2. Verify all tests pass
3. Review build logs for errors

## Related Documentation

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)