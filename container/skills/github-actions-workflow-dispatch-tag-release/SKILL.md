# GitHub Actions: workflow_dispatch Tag Release

Fix "Write access to repository not granted" (403) errors when pushing tags from GitHub Actions,
and implement manual release triggering via `workflow_dispatch` alongside tag-push triggers.

Use when:
(1) Adding `workflow_dispatch` to an existing tag-triggered release workflow
(2) Getting 403 "Write access to repository not granted" when pushing tags from CI
(3) `git push origin <tag>` fails in GitHub Actions even with a PAT
(4) Need to trigger releases from the GitHub Actions UI instead of manual `git tag` + `git push`
(5) Want draft release notifications during long Docker builds

## Problem

When a release workflow triggers on `push: tags: ['v*.*.*']` and you add `workflow_dispatch` so
users can trigger releases from the UI, you need to create a tag programmatically. However:

- `git push origin <tag>` fails with 403 even when `actions/checkout` uses a PAT via `token:`
- `git remote set-url` with the PAT embedded also fails
- The PAT may lack the specific scopes needed for tag push operations
- `GITHUB_TOKEN` does not support `git push` for tags by default

## Solution

**Use the GitHub REST API (`gh api`) instead of `git push` to create tags.**

The workflow's own `GITHUB_TOKEN` with `permissions: contents: write` can create tags via the API:

```yaml
- name: Create tag
  if: github.event_name == 'workflow_dispatch'
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    gh api repos/${{ github.repository }}/git/refs \
      -f ref="refs/tags/${{ steps.version.outputs.tag }}" \
      -f sha="${{ github.sha }}"
```

### Why This Works

- `gh api` authenticates via `GH_TOKEN` environment variable (set to `github.token`)
- `permissions: contents: write` at the workflow or job level grants the token write access
- The GitHub REST API endpoint `POST /repos/{owner}/{repo}/git/refs` creates refs (tags/branches)
  without needing git credential configuration or PAT scopes for push

### Key Implementation Details

1. **Version input normalization** - Accept both `1.2.3` and `v1.2.3`, auto-prefix `v` if missing:

```yaml
- name: Resolve version tag
  id: version
  run: |
    if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
      INPUT="${{ github.event.inputs.version }}"
      if [[ "$INPUT" != v* ]]; then
        INPUT="v${INPUT}"
      fi
      echo "tag=${INPUT}" >> "$GITHUB_OUTPUT"
    else
      echo "tag=${{ github.ref_name }}" >> "$GITHUB_OUTPUT"
    fi
```

2. **Dynamic `run-name`** - Show meaningful title in the Actions UI:

```yaml
run-name: "Release - ${{ inputs.version || github.ref_name }}"
```

- `inputs.version` resolves for `workflow_dispatch` triggers
- `github.ref_name` resolves for tag push triggers

3. **Draft release as build status notice** - For long builds (e.g., Docker ~10 min), create a draft
   release immediately so anyone checking the Releases page sees progress:

```yaml
- name: Create draft release (build in progress)
  uses: softprops/action-gh-release@v2
  with:
    tag_name: ${{ steps.version.outputs.tag }}
    name: ${{ steps.version.outputs.tag }}
    draft: true
    body: |
      ## Build in progress...
      The Docker image is being built (~10 minutes).
      Triggered by: @${{ github.actor }}
```

4. **Auto-generated release notes** - `generate_release_notes: true` on `softprops/action-gh-release@v2`
   auto-generates a changelog listing all PRs and commits since the previous tag.

## Verification

- Trigger the workflow manually from Actions UI with a version like `1.2.3`
- Confirm the tag `v1.2.3` appears in the repository's tags
- Confirm the draft release is created immediately
- Confirm the final release is published with artifacts and auto-generated notes
- Confirm pushing a tag locally (`git tag v1.2.4 && git push origin v1.2.4`) still triggers the workflow

## Full Working Example

```yaml
name: Docker Build & Release
run-name: "Release - ${{ inputs.version || github.ref_name }}"

permissions:
  contents: write

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Release version (e.g., 1.2.3 or v1.2.3)'
        required: true
        type: string

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - name: Resolve version tag
        id: version
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            INPUT="${{ github.event.inputs.version }}"
            if [[ "$INPUT" != v* ]]; then
              INPUT="v${INPUT}"
            fi
            echo "tag=${INPUT}" >> "$GITHUB_OUTPUT"
          else
            echo "tag=${{ github.ref_name }}" >> "$GITHUB_OUTPUT"
          fi

      - uses: actions/checkout@v4
        with:
          submodules: recursive
          token: ${{ secrets.GH_PAT }}  # Only needed if repo has private submodules

      - name: Create tag via GitHub API
        if: github.event_name == 'workflow_dispatch'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh api repos/${{ github.repository }}/git/refs \
            -f ref="refs/tags/${{ steps.version.outputs.tag }}" \
            -f sha="${{ github.sha }}"

      - name: Create draft release (build in progress)
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.version.outputs.tag }}
          name: ${{ steps.version.outputs.tag }}
          draft: true
          body: |
            ## Build in progress...
            The Docker image is being built (~10 minutes).
            Triggered by: @${{ github.actor }}

      # ... your build steps here (Docker build, tests, artifact creation, etc.) ...

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.version.outputs.tag }}
          draft: false
          files: |
            artifact.zip
          generate_release_notes: true
```

## Notes

- **Two tokens, two purposes**: `secrets.GH_PAT` is for checking out private submodules.
  `github.token` (the automatic `GITHUB_TOKEN`) is for creating tags and releases via the API.
  Do not confuse them.
- **Tag already exists**: If the tag already exists, `gh api` will return a 422 error.
  Add error handling if you want to support re-running with the same version.
- **`permissions: contents: write`** must be set at the workflow level or job level for
  `github.token` to have write access. Without it, the API call will also fail with 403.
- **`softprops/action-gh-release@v2`** is idempotent for the same tag - calling it twice
  (draft then publish) updates the same release rather than creating a duplicate.
- **Security**: `github.token` is scoped to the repository and expires after the workflow run.
  It is safer than a long-lived PAT for operations that only need repo-level access.

## References

- [GitHub REST API - Create a reference](https://docs.github.com/en/rest/git/refs#create-a-reference)
- [GitHub Actions - Automatic token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
- [GitHub Actions - workflow_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch)
