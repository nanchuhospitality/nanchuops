# Production Deployment Guide

This guide will help you deploy Nova Accounting to a production server with a custom domain.

## Prerequisites

- A VPS/server (Ubuntu 20.04+ recommended) or cloud hosting (DigitalOcean, AWS, etc.)
- Domain name pointing to your server's IP address
- SSH access to your server
- Basic knowledge of Linux commands

## Step 1: Server Setup

### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Node.js (v18 or higher)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Verify installation
```

### 1.3 Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### 1.4 Install Nginx (Web Server & Reverse Proxy)
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

## Step 2: Deploy Application

### 2.1 Clone/Upload Your Code
```bash
# Option 1: If using Git
cd /var/www
sudo git clone <your-repo-url> nova-accounting
cd nova-accounting

# Option 2: Upload files via SCP/SFTP to /var/www/nova-accounting
```

### 2.2 Install Dependencies
```bash
cd /var/www/nova-accounting
npm install
cd client
npm install
cd ..
```

### 2.3 Build React Application
```bash
npm run build
```

### 2.4 Configure Environment Variables
```bash
cp .env.example .env
nano .env
```

**Required .env configuration:**
```env
NODE_ENV=production
PORT=3001

# Generate a strong JWT secret:
# openssl rand -base64 32
JWT_SECRET=your-generated-secret-here

# Your domain (with https://)
ALLOWED_ORIGINS=https://yourdomain.com
```

### 2.5 Create Logs Directory
```bash
mkdir -p logs
```

## Step 3: Configure Nginx

### 3.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/nova-accounting
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    # For now, allow HTTP (remove after SSL setup)
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve uploaded files
    location /uploads {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
    }
}
```

### 3.2 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/nova-accounting /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Step 4: Setup SSL with Let's Encrypt

### 4.1 Install Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 4.2 Obtain SSL Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will automatically update your Nginx configuration.

### 4.3 Update Nginx Config (Remove HTTP redirect comment)
After SSL is set up, uncomment the redirect line in your Nginx config:
```bash
sudo nano /etc/nginx/sites-available/nova-accounting
# Uncomment: return 301 https://$server_name$request_uri;
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: Start Application with PM2

### 5.1 Start Application
```bash
cd /var/www/nova-accounting
pm2 start ecosystem.config.js --env production
```

### 5.2 Save PM2 Configuration
```bash
pm2 save
pm2 startup  # Follow instructions to enable auto-start on reboot
```

### 5.3 Check Status
```bash
pm2 status
pm2 logs nova-accounting
```

## Step 6: Configure Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

## Step 7: Database Backup Setup

### 7.1 Create Backup Script
```bash
nano /var/www/nova-accounting/backup-db.sh
```

**Add:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/nova-accounting"
DB_PATH="/var/www/nova-accounting/server/database/nova_accounting.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH "$BACKUP_DIR/nova_accounting_$DATE.db"

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
```

### 7.2 Make Executable and Schedule
```bash
chmod +x /var/www/nova-accounting/backup-db.sh
crontab -e
# Add: 0 2 * * * /var/www/nova-accounting/backup-db.sh
```

## Step 8: Update Client Environment (if needed)

If your API is on a different domain, create `.env.production` in the client folder:
```bash
cd /var/www/nova-accounting/client
nano .env.production
```

**Add:**
```
REACT_APP_API_URL=https://yourdomain.com
```

Then rebuild:
```bash
cd ..
npm run build
pm2 restart nova-accounting
```

## Step 9: Verify Deployment

1. Visit `https://yourdomain.com`
2. Login with default credentials (change immediately!)
3. Test all features
4. Check PM2 logs: `pm2 logs nova-accounting`
5. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`

## Maintenance Commands

### Update Application
```bash
cd /var/www/nova-accounting
git pull  # If using Git
npm install
cd client && npm install && cd ..
npm run build
pm2 restart nova-accounting
```

### View Logs
```bash
pm2 logs nova-accounting
pm2 logs nova-accounting --lines 100
```

### Restart Application
```bash
pm2 restart nova-accounting
```

### Stop Application
```bash
pm2 stop nova-accounting
```

## Security Checklist

- [ ] Changed default admin password
- [ ] Strong JWT_SECRET set in .env
- [ ] SSL/HTTPS enabled
- [ ] Firewall configured
- [ ] Database backups scheduled
- [ ] PM2 auto-restart enabled
- [ ] CORS configured with specific domain
- [ ] .env file not in version control (.gitignore)
- [ ] Regular system updates scheduled

## Troubleshooting

### Application won't start
```bash
pm2 logs nova-accounting
# Check for errors
```

### Nginx 502 Bad Gateway
- Check if app is running: `pm2 status`
- Check port: `netstat -tulpn | grep 3001`
- Check Nginx error log: `sudo tail -f /var/log/nginx/error.log`

### SSL Certificate Issues
```bash
sudo certbot renew --dry-run  # Test renewal
sudo certbot renew  # Renew if needed
```

### Database Issues
- Check file permissions: `ls -la server/database/`
- Check disk space: `df -h`
- Restore from backup if needed

## Alternative Hosting Options

### Option 1: DigitalOcean App Platform
- Push code to GitHub
- Connect to DigitalOcean App Platform
- Auto-deploys on push
- Handles SSL automatically

### Option 2: Heroku
- Install Heroku CLI
- `heroku create your-app-name`
- `git push heroku main`
- Add SSL addon

### Option 3: AWS EC2
- Launch EC2 instance
- Follow VPS instructions above
- Use Elastic IP for static IP

### Option 4: Railway/Render
- Connect GitHub repo
- Set environment variables
- Auto-deploys
- Free SSL included

## Support

For issues, check:
- PM2 logs: `pm2 logs`
- Nginx logs: `/var/log/nginx/`
- Application logs: `./logs/pm2-error.log`
