# GitHub Setup (Monorepo: `nanchuops`)

This project now uses one GitHub repository for both frontend and backend.

- Frontend: `client/`
- Backend: `server/`
- Repository: `https://github.com/nanchuhospitality/nanchuops`

## Prerequisites
- GitHub account
- Git installed locally
- Access to `nanchuhospitality` org (if pushing there)

## Create New Repo and Push (First Time)

### 1. Create repository on GitHub
1. Go to `https://github.com/new`
2. Repo name: `nanchuops`
3. Do **not** initialize with README/.gitignore/license
4. Create repository

### 2. Initialize and push from project root
Run from project root (`Nova Accounting`):

```bash
git init
git add .
git commit -m "Initial monorepo import"
git branch -M main
git remote add origin https://github.com/nanchuhospitality/nanchuops.git
git push -u origin main
```

If git is already initialized, skip `git init` and use:

```bash
git remote set-url origin https://github.com/nanchuhospitality/nanchuops.git
git push -u origin main
```

## Daily Workflow

```bash
git status
git add .
git commit -m "Describe changes"
git push origin main
```

## Verify Setup

```bash
git remote -v
git branch --show-current
git log --oneline -n 5
```

Expected:
- `origin` points to `https://github.com/nanchuhospitality/nanchuops.git`
- branch is `main`

## Use SSH (Optional)

### 1. Generate SSH key (if needed)
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

### 2. Add key to GitHub
```bash
cat ~/.ssh/id_ed25519.pub
```
Then add it in GitHub: Settings -> SSH and GPG keys -> New SSH key.

### 3. Switch remote to SSH
```bash
git remote set-url origin git@github.com:nanchuhospitality/nanchuops.git
```

## Connect Deploy Platforms

- Netlify (frontend): connect this same repo, set Base directory to `client`
- Backend host (Heroku/Render/Railway/Fly): deploy from same repo and run server start command

See `DEPLOYMENT_GUIDE.md` for exact deploy settings.

## Troubleshooting

### Repository not found
- Confirm repo exists in GitHub
- Confirm org/repo name is correct
- Confirm you have access permissions

### Permission denied
- HTTPS: use Personal Access Token instead of password
- SSH: confirm public key is added to GitHub

### Remote already exists
```bash
git remote remove origin
git remote add origin https://github.com/nanchuhospitality/nanchuops.git
```

### Pushed wrong branch
```bash
git branch -M main
git push -u origin main
```
