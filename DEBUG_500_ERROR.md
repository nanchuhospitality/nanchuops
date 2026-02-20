# Debugging 500 Server Error

If you're experiencing a 500 server error, follow these steps:

## Step 1: Check Server Console

Look at the terminal where the server is running. You should see detailed error messages including:
- The error message
- The error stack trace
- Which route/endpoint caused the error

## Step 2: Verify Database Schema

Run the database verification script:

```bash
node verify-db.js
```

This will show:
- All columns in the employees table
- Any missing required columns

## Step 3: Common Issues and Solutions

### Issue: Missing Database Columns

**Symptom:** Error mentions "no such column" or "SQLITE_ERROR"

**Solution:**
1. Stop the server
2. Delete the database file: `rm server/database/nova_accounting.db`
3. Restart the server (it will recreate the database with all columns)

### Issue: File Upload Error

**Symptom:** Error when uploading employee ID document

**Solution:**
1. Check if `server/uploads/employee-ids/` directory exists
2. Check file permissions
3. Verify file size is under 5MB
4. Verify file type is JPEG, PNG, or PDF

### Issue: Missing Dependencies

**Symptom:** Error mentions "Cannot find module"

**Solution:**
```bash
npm install
```

### Issue: Port Already in Use

**Symptom:** Server won't start

**Solution:**
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use a different port
PORT=8000 npm run server
```

## Step 4: Check Browser Console

Open browser developer tools (F12) and check:
1. **Console tab** - for JavaScript errors
2. **Network tab** - for API request/response details
   - Click on the failed request
   - Check the Response tab for error details

## Step 5: Test API Endpoints

Test the health endpoint:
```bash
curl http://localhost:3001/api/health
```

Should return: `{"status":"ok","message":"Server is running"}`

## Step 6: Enable Detailed Logging

The server now logs detailed error information to the console. Check:
- Database errors
- File upload errors
- Validation errors
- Route errors

## Getting Help

If the error persists:
1. Copy the full error message from the server console
2. Copy the error from browser Network tab (if available)
3. Note which action you were performing when the error occurred
4. Check if the error happens consistently or intermittently
