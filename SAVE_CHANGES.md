# How to Save All Changes

## Quick Guide to Commit and Push Changes

### For Server Changes (in `server` folder):

```bash
cd server

# 1. Check what files have changed
git status

# 2. Stage all changes
git add -A

# 3. Commit with a descriptive message
git commit -m "Your commit message describing the changes"

# 4. Push to remote repository
git push origin dev
```

### For Client Changes (in `client` folder):

```bash
cd client

# 1. Check what files have changed
git status

# 2. Stage all changes
git add -A

# 3. Commit with a descriptive message
git commit -m "Your commit message describing the changes"

# 4. Push to remote repository
git push origin main
```

## Example Commit Messages

- `"Add items and groups management features"`
- `"Fix UI styling for subcategory cards"`
- `"Update Chart of Accounts with search functionality"`
- `"Add Item Group dropdown to Items form"`

## Important Notes

1. **Always check status first** - `git status` shows what files have changed
2. **Review your changes** - Make sure you're committing the right files
3. **Write clear commit messages** - Describe what the changes do
4. **Push after committing** - Commits are local until you push to remote

## If You Have Uncommitted Changes

If you see files listed under "Changes not staged for commit" or "Untracked files", follow the steps above to commit and push them.
