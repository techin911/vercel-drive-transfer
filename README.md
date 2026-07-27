# DriveTransfer — Vercel Static App

Upload files from any browser directly to **Google Drive**. Free, no server needed.

## 🚀 Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your repo
3. Click **Deploy** (no config needed)

## ⚙️ Setup

1. Go to [script.google.com](https://script.google.com) → New Project
2. Paste the GAS script from the app's Setup Guide
3. Deploy as Web App: **Execute as: Me**, **Who has access: Anyone**
4. Copy the Web App URL
5. In the app → click ⚙️ → paste the URL → Save & Connect

## Features
- ✅ Drag & drop or browse file upload
- ✅ Progress bar + speed indicator  
- ✅ Files saved directly to your Google Drive
- ✅ My Files panel — see all uploaded files
- ✅ **Individual delete** — move any file to Drive Trash anytime
- ✅ File history stored in browser (localStorage)
- ✅ No backend server — 100% free on Vercel
- ✅ Works on mobile and desktop

## File Size Limit
Up to **30 MB** per file (browser base64 encoding limit).
For larger files, use the [UltraTransfer .NET](https://ultratransfer-dotnet.onrender.com) app.
