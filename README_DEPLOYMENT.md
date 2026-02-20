# Project Structure for Separate Deployments

This project is structured for separate deployments:
- **Server** → Heroku (`/server` folder) → Separate GitHub repo
- **Client** → Netlify (`/client` folder) → Separate GitHub repo

## 📁 Project Structure

```
nova-accounting/
├── server/                 # Heroku deployment
│   ├── index.js           # Server entry point
│   ├── package.json       # Server dependencies
│   ├── Procfile          # Heroku process file
│   ├── .env.example      # Server environment template
│   ├── routes/           # API routes
│   ├── database/         # Database files
│   └── uploads/          # File uploads
│
├── client/                # Netlify deployment
│   ├── src/              # React source code
│   ├── public/           # Public assets
│   ├── package.json      # Client dependencies
│   ├── netlify.toml      # Netlify configuration
│   └── .env.production.example  # Client env template
│
└── DEPLOYMENT_GUIDE.md   # Full deployment instructions
```

## 🚀 Quick Start

### Step 1: Setup GitHub Repositories

**First, create separate GitHub repositories:**
- See `GITHUB_SETUP.md` for detailed instructions

**Quick setup:**
```bash
# Server repository
cd server
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-server.git
git push -u origin main

# Client repository
cd ../client
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/nova-accounting-client.git
git push -u origin main
```

### Step 2: For Development (Local)

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Run separately:
cd server && npm start
cd client && npm start
```

### Step 3: For Production Deployment

See `DEPLOYMENT_GUIDE.md` for detailed instructions.

**Quick Summary:**
1. Setup GitHub repositories (see `GITHUB_SETUP.md`)
2. Deploy server to Heroku (see `DEPLOYMENT_GUIDE.md` Part 1)
3. Deploy client to Netlify (see `DEPLOYMENT_GUIDE.md` Part 2)
4. Update CORS settings on Heroku with Netlify URL

## 📝 Environment Variables

### Server (Heroku)
- `NODE_ENV=production`
- `JWT_SECRET` (generate with: `openssl rand -base64 32`)
- `ALLOWED_ORIGINS` (your Netlify URL)

### Client (Netlify)
- `REACT_APP_API_URL` (your Heroku API URL)

## 🔗 Important Links

- **GitHub Setup:** `GITHUB_SETUP.md` - Setup separate repositories
- **Full Deployment Guide:** `DEPLOYMENT_GUIDE.md` - Deploy to Heroku & Netlify
- **Server README:** `server/README.md`
- **Client README:** `client/README.md`
