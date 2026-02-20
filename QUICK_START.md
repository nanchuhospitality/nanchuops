# Quick Start Guide

## Fixing Port 5000 Permission Error

If you see `EPERM: operation not permitted` or `EADDRINUSE` errors, try these solutions:

### Solution 1: Use a Different Port (Recommended)

Create a `.env` file in the root directory:
```
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secret-key-change-this-in-production
```

Then update `client/package.json` to change the proxy:
```json
"proxy": "http://localhost:3001"
```

### Solution 2: Check if Port 5000 is Already in Use

```bash
# Check what's using port 5000
lsof -i :5000

# Kill the process if needed
kill -9 <PID>
```

### Solution 3: Use Port 3001 Directly

Run the server on port 3001:
```bash
PORT=3001 npm run server
```

And update the client proxy in `client/package.json`:
```json
"proxy": "http://localhost:3001"
```

## Starting the Application

1. **Install dependencies** (if not done already):
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. **Start the backend server**:
   ```bash
   npm run server
   ```
   
   You should see:
   - ✓ Server running on http://localhost:5000 (or your chosen port)
   - ✓ Connected to SQLite database
   - ✓ Default admin user created

3. **Start the frontend** (in a new terminal):
   ```bash
   cd client
   npm start
   ```

4. **Or start both at once**:
   ```bash
   npm run dev
   ```

## Default Login Credentials

- **Username:** `admin`
- **Password:** `admin123`

## Troubleshooting

### Server won't start
- Check if the port is already in use
- Try a different port (3001, 8000, etc.)
- Make sure all dependencies are installed

### Database errors
- Delete `server/database/nova_accounting.db` and restart
- Check server console for initialization messages

### Login fails
- Make sure the backend server is running
- Check browser console (F12) for error messages
- Verify database has admin user: `node check-db.js`
