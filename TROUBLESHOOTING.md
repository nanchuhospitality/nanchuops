# Troubleshooting Login Issues

If you're experiencing login failures, follow these steps:

## 1. Check if the Server is Running

Make sure the backend server is running on port 5000:

```bash
# Check if server is running
curl http://localhost:5000/api/health

# Should return: {"status":"ok","message":"Server is running"}
```

If this fails, start the server:
```bash
npm run server
```

## 2. Check Database Initialization

Verify that the database has been initialized and the admin user exists:

```bash
node check-db.js
```

This will show:
- Total number of users
- Whether the admin user exists

If the admin user doesn't exist, restart the server to trigger database initialization.

## 3. Check Frontend Connection

Make sure the frontend can reach the backend:

1. Open browser developer tools (F12)
2. Go to Network tab
3. Try logging in
4. Check if the request to `/api/auth/login` is being made
5. Check the response status and error message

## 4. Common Issues

### Issue: "Cannot connect to server"
**Solution:** Make sure the backend server is running on port 5000

### Issue: "Invalid username or password"
**Solution:** 
- Default credentials: username: `admin`, password: `admin123`
- Make sure you're using the exact username (case-sensitive)
- Check if the database has been initialized (run `node check-db.js`)

### Issue: "Database error"
**Solution:**
- Check if `server/database/nova_accounting.db` exists
- Delete the database file and restart the server to recreate it
- Check server console for error messages

### Issue: CORS errors
**Solution:**
- Make sure the proxy is set in `client/package.json`
- Restart the React development server after changing proxy settings

## 5. Reset Database

If you need to start fresh:

```bash
# Stop the server
# Delete the database file
rm server/database/nova_accounting.db

# Restart the server (it will recreate the database)
npm run server
```

## 6. Verify Default Admin User

The default admin user should be created automatically when the server starts:
- **Username:** `admin`
- **Password:** `admin123`
- **Email:** `admin@nova.com`
- **Role:** `admin`

If this user doesn't exist after server startup, check the server console for error messages.

## Still Having Issues?

1. Check the browser console for JavaScript errors
2. Check the server console for backend errors
3. Verify all dependencies are installed:
   ```bash
   npm install
   cd client && npm install
   ```
4. Make sure you're using the correct port (backend: 5000, frontend: 3000)
