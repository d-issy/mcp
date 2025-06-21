# Release Guide

This document explains how releases are managed in this repository using Release Please automation.

## Release Automation

This repository uses [Release Please](https://github.com/googleapis/release-please) to automate the release process. Releases are triggered automatically based on conventional commit messages.

## Conventional Commits

Use conventional commit format to control version bumping:

### Version Bumping Rules

| Commit Type | Example | Version Impact |
|-------------|---------|----------------|
| `fix:` | `fix: resolve file reading issue` | **Patch** (0.1.2 → 0.1.3) |
| `feat:` | `feat: add new file operation` | **Minor** (0.1.2 → 0.2.0) |
| `feat!:` or `BREAKING CHANGE:` | `feat!: change API signature` | **Major** (0.1.2 → 1.0.0) |

### Other Commit Types

- `chore:` - No version bump
- `docs:` - No version bump  
- `style:` - No version bump
- `refactor:` - No version bump
- `test:` - No version bump

## Release Process

### 1. Automatic Release PR Creation

When commits are pushed to the `main` branch, Release Please automatically:

1. Analyzes commits since the last release
2. Determines the appropriate version bump
3. Creates a release pull request with:
   - Updated `package.json` version
   - Generated `CHANGELOG.md` entries
   - Updated version references in documentation

### 2. Review and Merge

1. Review the generated release PR
2. Verify the changelog entries
3. Merge the PR when ready to release

### 3. Automatic Release Creation

After merging the release PR, Release Please automatically:

1. Creates a Git tag (e.g., `v0.1.3`)
2. Creates a GitHub release with changelog
3. Runs build and tests

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

### Commit Messages

```bash
# Good examples
git commit -m "feat: add copy operation to file server"
git commit -m "fix: handle permission errors gracefully"  
git commit -m "feat!: change configuration format"

# Poor examples  
git commit -m "update code"
git commit -m "fixes"
git commit -m "WIP"
```

### Breaking Changes

For breaking changes, use either:

```bash
# Option 1: Use ! suffix
git commit -m "feat!: change API signature"

# Option 2: Use footer
git commit -m "feat: change API signature

BREAKING CHANGE: The API now requires authentication headers"
```

### Multiple Changes in One Commit

Use footers for multiple distinct changes:

```
feat: add new authentication system

This commit adds support for multiple auth providers.

fix(auth): resolve token validation issue
  Fixes token expiration handling
  
feat(auth): add OAuth2 support
  Adds support for OAuth2 authentication flow
```

## Release Schedule

- **Patch releases**: As needed for bug fixes
- **Minor releases**: For new features
- **Major releases**: For breaking changes (planned releases)

## Troubleshooting

### Release PR Not Created

1. Ensure commits follow conventional commit format
2. Check that commits contain actual changes worth releasing
3. Verify the Release Please workflow is enabled

### Incorrect Version Bump

1. Review commit messages for correct prefixes
2. Use `Release-As:` footer to override version
3. Edit the release PR manually if needed

### Failed Release

1. Check CI/CD pipeline status
2. Verify all tests pass
3. Review build logs for errors

## Related Documentation

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)