---
name: git-it-done
description: Stage all changes, commit them with a relevant generated message, and push to the current branch. Use when the user wants to quickly add, commit, and push everything in one step.
---

# git-it-done

One-shot "ship it": stage everything, commit with a message that reflects the current changes, and push to the current branch.

## Steps

1. **Inspect the changes** so the commit message is relevant:
   - `git status --short`
   - `git diff --stat` (and `git diff` / `git diff --staged` if you need detail to describe the change)
   - `git branch --show-current` to get the current branch name.

2. **Stage everything:**
   ```bash
   git add .
   ```

3. **Commit** with a concise, relevant message derived from the actual changes (not a generic placeholder). Summarize the dominant change in the subject line. End the message with the required trailer:
   ```bash
   git commit -m "$(cat <<'EOF'
   <relevant message describing the current changes>

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

4. **Push to the current branch:**
   ```bash
   git push origin "$(git branch --show-current)"
   ```
   If the branch has no upstream yet, use `git push -u origin "$(git branch --show-current)"`.

## Notes

- If there is nothing to commit (`git status` is clean), say so and stop — don't create an empty commit.
- Keep the commit subject under ~72 characters; add a body only if the change needs explanation.
- Report the commit hash and the push result back to the user.
