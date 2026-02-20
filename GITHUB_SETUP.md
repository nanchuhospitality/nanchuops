# GitHub Setup: Separate Repositories for Server and Client

This guide will help you set up separate GitHub repositories for the server (Heroku) and client (Netlify).

## 📋 Prerequisites

- GitHub account
- Git installed on your computer
- Terminal/Command line access

---

## 🚀 Option 1: Create New Repositories (Recommended)

### Step 1: Create Repositories on GitHub

1. **Go to GitHub:** https://github.com/new

2. **Create Server Repository:**
   - Repository name: `nova-accounting-server` (or your preferred name)
   - Description: "Nova Accounting API Server"
   - Visibility: Private (recommended) or Public
   - **DO NOT** initialize with README, .gitignore, or license
   - Click "Create repository"

3. **Create Client Repository:**
   - Repository name: `nova-accounting-client` (or your preferred name)
   - Description: "Nova Accounting React Client"
   - Visibility: Private (recommended) or Public
   - **DO NOT** initialize with README, .gitignore, or license
   - Click "Create repository"

### Step 2: Initialize Server Repository

```bash
# Navigate to server folder
cd server

# Initialize git (if not already initialized)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Nova Accounting Server"

# Add remote repository (replace with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-server.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 3: Initialize Client Repository

```bash
# Navigate to client folder
cd ../client

# Initialize git (if not already initialized)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Nova Accounting Client"

# Add remote repository (replace with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-client.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## 🔄 Option 2: Split Existing Repository

If you already have a single repository and want to split it:

### Step 1: Create New Repositories on GitHub

Follow Step 1 from Option 1 above.

### Step 2: Extract Server to New Repository

```bash
# Navigate to your project root
cd /path/to/nova-accounting

# Create a temporary branch for server
git checkout -b server-only

# Remove client folder from git tracking (keep files locally)
git rm -r --cached client

# Commit the removal
git commit -m "Remove client folder for separate repository"

# Create new server repository
cd server
git init
git add .
git commit -m "Initial commit: Nova Accounting Server"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-server.git
git branch -M main
git push -u origin main
```

### Step 3: Extract Client to New Repository

```bash
# Go back to project root
cd /path/to/nova-accounting

# Create a temporary branch for client
git checkout -b client-only

# Remove server folder from git tracking
git rm -r --cached server

# Commit the removal
git commit -m "Remove server folder for separate repository"

# Create new client repository
cd client
git init
git add .
git commit -m "Initial commit: Nova Accounting Client"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-client.git
git branch -M main
git push -u origin main
```

---

## 📝 Detailed Step-by-Step Instructions

### For Server Repository

1. **Navigate to server folder:**
   ```bash
   cd server
   ```

2. **Check if git is initialized:**
   ```bash
   git status
   ```
   If you see "not a git repository", initialize it:
   ```bash
   git init
   ```

3. **Check .gitignore exists:**
   ```bash
   ls -la .gitignore
   ```
   If it doesn't exist, the one we created should be there. If not, create it with:
   ```bash
   cat > .gitignore << EOF
   node_modules/
   .env
   *.db
   database/*.db
   uploads/
   *.log
   .DS_Store
   EOF
   ```

4. **Add all files:**
   ```bash
   git add .
   ```

5. **Create initial commit:**
   ```bash
   git commit -m "Initial commit: Nova Accounting Server"
   ```

6. **Add GitHub remote:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-server.git
   ```
   Replace `YOUR_USERNAME` with your GitHub username.

7. **Set main branch and push:**
   ```bash
   git branch -M main
   git push -u origin main
   ```

### For Client Repository

1. **Navigate to client folder:**
   ```bash
   cd client
   ```

2. **Initialize git:**
   ```bash
   git init
   ```

3. **Check .gitignore exists:**
   ```bash
   ls -la .gitignore
   ```

4. **Add all files:**
   ```bash
   git add .
   ```

5. **Create initial commit:**
   ```bash
   git commit -m "Initial commit: Nova Accounting Client"
   ```

6. **Add GitHub remote:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-client.git
   ```

7. **Set main branch and push:**
   ```bash
   git branch -M main
   git push -u origin main
   ```

---

## 🔐 Using SSH Instead of HTTPS

If you prefer SSH (recommended for frequent pushes):

### Generate SSH Key (if you don't have one)

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter to accept default file location
# Enter a passphrase (optional but recommended)
```

### Add SSH Key to GitHub

1. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
3. Paste your key and save

### Use SSH URLs

```bash
# Server
git remote set-url origin git@github.com:YOUR_USERNAME/nova-accounting-server.git

# Client
git remote set-url origin git@github.com:YOUR_USERNAME/nova-accounting-client.git
```

---

## ✅ Verification

### Verify Server Repository

```bash
cd server
git remote -v
# Should show your GitHub repository URL

git log
# Should show your initial commit

# Check GitHub
# Visit: https://github.com/YOUR_USERNAME/nova-accounting-server
```

### Verify Client Repository

```bash
cd client
git remote -v
# Should show your GitHub repository URL

git log
# Should show your initial commit

# Check GitHub
# Visit: https://github.com/YOUR_USERNAME/nova-accounting-client
```

---

## 🔄 Future Updates

### Updating Server Repository

```bash
cd server

# Make your changes, then:
git add .
git commit -m "Description of changes"
git push origin main
```

### Updating Client Repository

```bash
cd client

# Make your changes, then:
git add .
git commit -m "Description of changes"
git push origin main
```

---

## 🔗 Connecting to Heroku and Netlify

### Heroku (Server)

1. **Connect GitHub repository:**
   ```bash
   cd server
   heroku git:remote -a your-heroku-app-name
   ```

2. **Or via Heroku Dashboard:**
   - Go to your Heroku app
   - Deploy tab → Connect to GitHub
   - Select `nova-accounting-server` repository
   - Enable "Automatic deploys"

### Netlify (Client)

1. **Via Netlify Dashboard:**
   - Go to Netlify
   - Add new site → Import from Git
   - Connect to GitHub
   - Select `nova-accounting-client` repository
   - Configure:
     - Base directory: `client` (if repo is at root) or leave blank
     - Build command: `npm run build`
     - Publish directory: `build`

---

## 📋 Checklist

### Server Repository
- [ ] GitHub repository created
- [ ] Git initialized in `/server` folder
- [ ] `.gitignore` file present
- [ ] All files added and committed
- [ ] Remote added and pushed
- [ ] Verified on GitHub

### Client Repository
- [ ] GitHub repository created
- [ ] Git initialized in `/client` folder
- [ ] `.gitignore` file present
- [ ] All files added and committed
- [ ] Remote added and pushed
- [ ] Verified on GitHub

### Integration
- [ ] Heroku connected to server repository
- [ ] Netlify connected to client repository
- [ ] Automatic deploys enabled (optional)

---

## 🛠️ Troubleshooting

### "Repository not found" Error

- Check repository name matches exactly
- Verify you have access to the repository
- Try using SSH instead of HTTPS

### "Permission denied" Error

- For HTTPS: Use personal access token instead of password
- For SSH: Make sure SSH key is added to GitHub

### "Remote origin already exists"

```bash
# Remove existing remote
git remote remove origin

# Add new remote
git remote add origin YOUR_REPO_URL
```

### Files Not Showing on GitHub

- Check `.gitignore` isn't excluding them
- Verify files are committed: `git status`
- Make sure you pushed: `git push origin main`

### Large Files (node_modules, etc.)

- Make sure `.gitignore` includes `node_modules/`
- If already committed, remove from git:
  ```bash
  git rm -r --cached node_modules
  git commit -m "Remove node_modules from git"
  ```

---

## 📚 Quick Reference Commands

### Server Repository

```bash
cd server
git status                    # Check status
git add .                    # Stage all changes
git commit -m "Message"      # Commit changes
git push origin main         # Push to GitHub
git pull origin main         # Pull latest changes
```

### Client Repository

```bash
cd client
git status                    # Check status
git add .                    # Stage all changes
git commit -m "Message"      # Commit changes
git push origin main         # Push to GitHub
git pull origin main         # Pull latest changes
```

---

## 🎉 You're Done!

Your server and client are now in separate GitHub repositories:
- **Server:** `https://github.com/YOUR_USERNAME/nova-accounting-server`
- **Client:** `https://github.com/YOUR_USERNAME/nova-accounting-client`

Next steps:
1. Connect Heroku to server repository
2. Connect Netlify to client repository
3. Set up automatic deployments (optional)

See `DEPLOYMENT_GUIDE.md` for deployment instructions.
