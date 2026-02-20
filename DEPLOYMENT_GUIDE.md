# Deployment Guide: Heroku (Server) + Netlify (Client)

This guide will help you deploy the server to Heroku and the client to Netlify separately.

## 📋 Prerequisites

- **GitHub account** with separate repositories for server and client
  - See `GITHUB_SETUP.md` for setting up separate repositories
- **Heroku account** (free tier available)
- **Netlify account** (free tier available)
- **Node.js** installed locally (for testing)

---

## 🚀 Part 1: Deploy Server to Heroku

### Step 1: Setup GitHub Repository (if not done)

**Important:** Server and client should be in separate GitHub repositories.

If you haven't set this up yet, see `GITHUB_SETUP.md` for detailed instructions.

**Quick setup:**
```bash
cd server
git init
git add .
git commit -m "Initial commit: Nova Accounting Server"
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-server.git
git branch -M main
git push -u origin main
```

### Step 2: Prepare Server

1. **Navigate to server directory:**
   ```bash
   cd server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Test locally:**
   ```bash
   npm start
   ```

### Step 3: Create Heroku App

1. **Install Heroku CLI:**
   - Download from: https://devcenter.heroku.com/articles/heroku-cli

2. **Login to Heroku:**
   ```bash
   heroku login
   ```

3. **Create Heroku app:**
   ```bash
   cd server
   heroku create your-app-name
   # Example: heroku create nova-accounting-api
   ```

### Step 4: Configure Environment Variables

1. **Generate JWT Secret:**
   ```bash
   openssl rand -base64 32
   ```

2. **Set Heroku Config Vars:**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set JWT_SECRET=your-generated-secret-here
   heroku config:set ALLOWED_ORIGINS=https://your-netlify-app.netlify.app
   ```

   **Note:** You'll update `ALLOWED_ORIGINS` after deploying to Netlify with the actual Netlify URL.

### Step 5: Deploy to Heroku

**Option A: Connect GitHub Repository (Recommended)**

1. **Via Heroku Dashboard:**
   - Go to your Heroku app dashboard
   - Click "Deploy" tab
   - Under "Deployment method", select "GitHub"
   - Connect to your `nova-accounting-server` repository
   - Click "Enable Automatic Deploys" (optional)
   - Click "Deploy Branch" to deploy immediately

2. **Via Heroku CLI:**
   ```bash
   cd server
   heroku git:remote -a your-app-name
   git push heroku main
   ```

**Option B: Direct Git Push**

```bash
cd server
heroku git:remote -a your-app-name
git push heroku main
```

### Step 6: Verify Deployment

```bash
# Check logs
heroku logs --tail

# Test API
curl https://your-app-name.herokuapp.com/api/health
```

### Step 7: Initialize Database

The database will be created automatically on first request. However, you may want to create the admin user:

```bash
# SSH into Heroku
heroku run bash

# Then run (if you have a script):
node -e "const {initDatabase} = require('./database/init'); initDatabase();"
```

**Note:** Heroku uses ephemeral filesystem. For production, consider using PostgreSQL addon for persistent storage.

---

## 🌐 Part 2: Deploy Client to Netlify

### Step 1: Setup GitHub Repository (if not done)

**Important:** Client should be in a separate GitHub repository.

If you haven't set this up yet, see `GITHUB_SETUP.md` for detailed instructions.

**Quick setup:**
```bash
cd client
git init
git add .
git commit -m "Initial commit: Nova Accounting Client"
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-client.git
git branch -M main
git push -u origin main
```

### Step 2: Prepare Client

1. **Navigate to client directory:**
   ```bash
   cd client
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Test build locally:**
   ```bash
   npm run build
   ```
   
   **Note:** Environment variable `REACT_APP_API_URL` will be set in Netlify dashboard, not in a local file.

### Step 3: Deploy to Netlify

**Option A: Netlify Dashboard (Recommended)**

1. **Go to:** https://app.netlify.com
2. **Click:** "Add new site" > "Import an existing project"
3. **Connect to Git:** Choose GitHub
4. **Authorize Netlify** to access your GitHub account
5. **Select repository:** Choose `nova-accounting-client`
6. **Configure build settings:**
   - **Base directory:** Leave blank (or `client` if repo structure is different)
   - **Build command:** `npm run build`
   - **Publish directory:** `build`
7. **Add Environment Variables:**
   - Click "Show advanced" or go to Site Settings after creation
   - Go to Site Settings > Environment Variables
   - Click "Add variable"
   - **Key:** `REACT_APP_API_URL`
   - **Value:** `https://your-app-name.herokuapp.com` (your Heroku URL)
8. **Deploy:**
   - Click "Deploy site"
   - Wait for build to complete

**Option B: Netlify CLI**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Initialize (first time)
cd client
netlify init

# Deploy
netlify deploy --prod
```

**Option C: Drag & Drop (Not recommended for production)**

1. Build the app: `cd client && npm run build`
2. Go to Netlify dashboard
3. Drag the `client/build` folder to deploy
4. **Note:** You'll need to manually set environment variables in dashboard

### Step 3: Update CORS on Heroku

After getting your Netlify URL, update Heroku:

```bash
heroku config:set ALLOWED_ORIGINS=https://your-app.netlify.app
heroku restart
```

---

## 🔄 Continuous Deployment Setup

### Heroku (Automatic Deploy)

1. Go to Heroku Dashboard
2. Select your app
3. Go to "Deploy" tab
4. Connect to GitHub
5. Enable "Automatic deploys" from `main` branch
6. Set branch to deploy: `main` (or your server branch)

### Netlify (Automatic Deploy)

1. Already configured if you connected Git
2. Netlify will auto-deploy on every push to `main` branch
3. Make sure `client` folder changes trigger builds

---

## 📝 Important Notes

### Database on Heroku

⚠️ **Heroku uses ephemeral filesystem** - files are deleted on every deploy/restart.

**Solutions:**
1. **Use Heroku Postgres (Recommended):**
   ```bash
   heroku addons:create heroku-postgresql:mini
   ```
   Then update your database connection to use PostgreSQL.

2. **Use external storage** (AWS S3, Cloudinary) for file uploads

3. **Backup database regularly** before deploys

### File Uploads

Since Heroku filesystem is ephemeral, uploaded files will be lost. Consider:
- Using **Cloudinary** or **AWS S3** for file storage
- Or use **Heroku Postgres** with bytea for small files

### Environment Variables

**Heroku:**
- Set via: `heroku config:set KEY=value`
- Or via Dashboard: Settings > Config Vars

**Netlify:**
- Set via Dashboard: Site Settings > Environment Variables
- Or via `netlify.toml` (not recommended for secrets)

---

## 🧪 Testing Deployment

### Test Server (Heroku)

```bash
# Health check
curl https://your-app.herokuapp.com/api/health

# Test login (replace with your credentials)
curl -X POST https://your-app.herokuapp.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Test Client (Netlify)

1. Visit your Netlify URL
2. Try logging in
3. Check browser console for errors
4. Verify API calls are going to Heroku

---

## 🔧 Troubleshooting

### Heroku Issues

**App crashes:**
```bash
heroku logs --tail
```

**Database not found:**
- Database is created on first request
- Check logs for initialization errors

**CORS errors:**
- Verify `ALLOWED_ORIGINS` includes your Netlify URL
- Check for trailing slashes
- Restart: `heroku restart`

### Netlify Issues

**Build fails:**
- Check build logs in Netlify dashboard
- Verify `REACT_APP_API_URL` is set
- Ensure `package.json` has correct build script

**API calls fail:**
- Verify `REACT_APP_API_URL` matches Heroku URL
- Check browser console for CORS errors
- Ensure Heroku `ALLOWED_ORIGINS` includes Netlify URL

**404 on refresh:**
- `netlify.toml` should handle this with redirects
- Verify redirect rule is present

---

## 📚 Quick Reference

### Heroku Commands

```bash
# View logs
heroku logs --tail

# Restart app
heroku restart

# Set config var
heroku config:set KEY=value

# View config vars
heroku config

# Open app
heroku open

# Run command
heroku run bash
```

### Netlify Commands

```bash
# Deploy
netlify deploy --prod

# View logs
netlify logs

# Open site
netlify open
```

---

## ✅ Deployment Checklist

### Heroku (Server)
- [ ] Heroku app created
- [ ] Environment variables set (JWT_SECRET, ALLOWED_ORIGINS)
- [ ] Code deployed
- [ ] Health check passes
- [ ] Database initialized
- [ ] Admin user created

### Netlify (Client)
- [ ] Netlify site created
- [ ] Environment variable set (REACT_APP_API_URL)
- [ ] Build succeeds
- [ ] Site accessible
- [ ] Login works
- [ ] API calls succeed

### Post-Deployment
- [ ] Updated Heroku ALLOWED_ORIGINS with Netlify URL
- [ ] Changed default admin password
- [ ] Tested all features
- [ ] Set up database backups (if using SQLite)
- [ ] Configured custom domain (optional)

---

## 🎉 You're Done!

Your application is now live:
- **API:** `https://your-app.herokuapp.com`
- **Client:** `https://your-app.netlify.app`

Remember to:
1. Change default admin password
2. Set up database backups
3. Monitor logs regularly
4. Update dependencies periodically
