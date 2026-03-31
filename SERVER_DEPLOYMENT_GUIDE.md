# GLIDE Agent — GCP Server Deployment Guide

This document covers the end-to-end setup for deploying the `glide-agent` dual-architecture application (Backend API + Next.js/Vite Frontend) to a Linux server (GCP/Ubuntu) using Nginx and PM2, alongside other existing applications.

## 1. Initial Server Setup (Node & PM2)

If your server does not have Node.js or `npm` installed, install it cleanly via NodeSource:

```bash
# 1. Update your system
sudo apt update
sudo apt install curl -y

# 2. Add the NodeSource repository (Node v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 3. Install Node.js (and npm)
sudo apt-get install -y nodejs
```

Install PM2 globally so it can manage your background processes:
```bash
sudo npm install -g pm2
```

## 2. Clone and Prepare the Project

Navigate to your working directory and clone your repo:
```bash
git clone https://your-repository-url.git glide-agents
cd glide-agents

# Install dependencies
npm install 

# Create your `.env` file and set the required keys
nano .env
```
*Note: Ensure your backend uses `PORT=3001` in the `.env` file.*

## 3. Start Background Processes with PM2

Because GLIDE uses two separate running instances, we run both independently through PM2 from inside the `glide-agents` folder.

```bash
# If you have old messy instances, clear them first:
pm2 delete all 

# Start the Backend Server (Port 3001)
pm2 start server/index.js --name "glide-backend"

# Start the Frontend Dashboard (Port 4002)
cd dashboard
pm2 start "npx serve ./ -p 4002 -s" --name "glide-dashboard"

# Save the unified PM2 list so they restart on reboot
cd ..
pm2 save
```

## 4. Prepare Nginx for Routing

If this is a fresh Ubuntu server, Nginx comes with a stubborn `default` configuration active that intercepts Port 80 traffic (causing 404 errors as it overrides other sites). Delete the shortcut:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

## 5. Create the Custom Nginx Reverse Proxy

Create an Nginx configuration file specifically for GLIDE:

```bash
sudo nano /etc/nginx/sites-available/glide-agents
```

Paste the following routing logic. This ensures your dashboard and backend are mapped locally via `127.0.0.1` (crucial for preventing IPv6 `::1` 502 Bad Gateway errors).

```nginx
server {
    listen 80;
    
    # Change this to your desired subdomain/domain
    server_name agent.paperly.online; 

    # 1. Route all backend traffic (API endpoints) to Port 3001
    location ~ ^/(api|webhook|assets|output)/? {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 2. Route everything else (The Dashboard UI) to Port 4002
    location / {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 6. Activate and Restart Nginx

Link your configuration and reboot the server's traffic cop:

```bash
# Link to active sites
sudo ln -s /etc/nginx/sites-available/glide-agents /etc/nginx/sites-enabled/

# Ensure the syntax is clean
sudo nginx -t

# Apply changes
sudo systemctl restart nginx
```

## 7. Connect the Offline Dashboard (Crucial Step!)

Once you navigate to `http://agent.paperly.online` in a web browser, the Next.js/Vite React app is successfully downloaded to your device. 

However, the dashboard will initially report **Offline** because it is trying to ping `http://localhost:4001` (your local computer). 

To bring it online:
1. Locate the **"API Command"** text box in the top-right corner of the web UI.
2. Erase the local template link.
3. Replace it with your live domain: `http://agent.paperly.online`
4. Click **Connect**.

## 8. Generate Free SSL Certificate (Optional)

To secure the connection (HTTPS), grab a free certificate from Let's Encrypt using Certbot. Nginx will automatically handle the renewals.

```bash
sudo certbot --nginx -d agent.paperly.online
```
