# Environment Variables Setup

## Create .env File

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=3001

# JWT Secret - Generate a strong random string for production
# Use: openssl rand -base64 32
JWT_SECRET=your-strong-random-secret-key-here

# CORS Configuration - Comma-separated list of allowed origins
# Example: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

## Generate JWT Secret

Run this command to generate a secure JWT secret:

```bash
openssl rand -base64 32
```

Copy the output and paste it as the value for `JWT_SECRET` in your `.env` file.

## Client Environment (Optional)

If your API is hosted on a different domain, create `client/.env.production`:

```env
REACT_APP_API_URL=https://yourdomain.com
```

## Security Notes

- **Never commit `.env` to version control** - it's already in `.gitignore`
- **Change default admin password** immediately after first login
- **Use strong JWT_SECRET** in production
- **Restrict CORS** to your domain only in production
