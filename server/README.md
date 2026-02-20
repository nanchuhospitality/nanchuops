# Nova Accounting Server

This is the backend API server for Nova Accounting, designed to be deployed on Heroku.

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your settings

# Start server
npm start

# Or with nodemon (auto-restart)
npm run dev
```

### Environment Variables

Create a `.env` file with:

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000
```

## 📦 Deployment to Heroku

See `../DEPLOYMENT_GUIDE.md` for detailed instructions.

**Quick Steps:**
1. `heroku create your-app-name`
2. `heroku config:set JWT_SECRET=your-secret`
3. `heroku config:set ALLOWED_ORIGINS=https://your-netlify-app.netlify.app`
4. `git push heroku main`

## 📁 Structure

```
server/
├── index.js              # Main server file
├── package.json          # Dependencies
├── Procfile             # Heroku process file
├── routes/              # API routes
│   ├── auth.js
│   ├── sales.js
│   ├── dashboard.js
│   ├── employees.js
│   └── positions.js
├── database/            # Database files
│   └── init.js
├── middleware/          # Express middleware
│   └── auth.js
└── uploads/            # File uploads directory
```

## 🔧 API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `GET /api/sales` - Get sales records
- `POST /api/sales` - Create sales record
- And more...

## ⚠️ Important Notes

- **Heroku uses ephemeral filesystem** - files are deleted on restart
- Consider using Heroku Postgres for database
- Use external storage (S3, Cloudinary) for file uploads
- Database is created automatically on first request
