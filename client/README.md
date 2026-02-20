# Nova Accounting Client

This is the React frontend for Nova Accounting, designed to be deployed on Netlify.

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will run on `http://localhost:3000`

### Environment Variables

For production, set in Netlify Dashboard:
- `REACT_APP_API_URL` - Your Heroku API URL (e.g., `https://your-app.herokuapp.com`)

For local development, create `.env.development.local`:
```env
REACT_APP_API_URL=http://localhost:3001
```

## 📦 Deployment to Netlify

See `../DEPLOYMENT_GUIDE.md` for detailed instructions.

**Quick Steps:**
1. Connect GitHub repo to Netlify
2. Set base directory: `client`
3. Build command: `npm run build`
4. Publish directory: `client/build`
5. Add environment variable: `REACT_APP_API_URL`

## 📁 Structure

```
client/
├── src/
│   ├── components/     # Reusable components
│   ├── pages/          # Page components
│   ├── context/        # React context (Auth)
│   ├── utils/          # Utility functions
│   ├── App.js          # Main app component
│   └── index.js        # Entry point
├── public/             # Static files
├── package.json        # Dependencies
└── netlify.toml        # Netlify configuration
```

## 🔧 Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## ⚠️ Important Notes

- API URL is configured via `REACT_APP_API_URL` environment variable
- Make sure Heroku CORS allows your Netlify domain
- All API calls use relative paths that work with the baseURL
