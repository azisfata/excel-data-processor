# 📊 Excel Data Processor

Aplikasi web untuk processing data Excel dengan AI integration, user management, dan file upload capabilities.

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+)
- **npm** atau **yarn**

### 🛠️ Installation & Setup

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd excel-data-processor
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment Variables**
   ```bash
   # Copy template environment file
   cp .env.example .env
   
   # Edit .env file dengan konfigurasi Anda:
   nano .env  # atau gunakan editor favorit Anda
   ```

4. **Konfigurasi Wajib di `.env`**
   ```bash
   # Supabase Configuration (dari dashboard Supabase)
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   
   # Gemini AI Configuration (dari Google AI Studio)
   GEMINI_API_KEY=your-gemini-api-key-here
   
   # Security (generate strong string untuk production)
   JWT_SECRET=your-super-secret-jwt-key-here
   
   # Admin Emails (opsional, auto-approved)
   ADMIN_EMAILS=admin@company.com,manager@company.com
   ```

5. **Run Development Server**
   ```bash
   npm run dev
   ```

   Aplikasi akan berjalan di:
   - 🌐 **Frontend**: http://localhost:5173
   - 🔐 **Auth API**: http://localhost:3002
   - 📁 **File Upload API**: http://localhost:3001

## 🏗️ Project Structure

```
excel-data-processor/
├── 📁 src/                    # Frontend React application
│   ├── components/              # React components
│   ├── pages/                  # Page components
│   ├── contexts/               # React contexts
│   ├── hooks/                  # Custom hooks
│   ├── config/                 # Configuration files
│   └── utils/                 # Utility functions
├── 📁 server/                 # Backend services
│   ├── auth-server.js          # Authentication & user management
│   └── activity-upload-server.js # File upload handling
├── 📁 services/               # Business logic services
├── 📁 scripts/                # Utility scripts
├── 📁 bahanUpload/            # Upload directory (development)
├── 📄 .env.example           # Environment template
├── 📄 .env                   # Actual environment (ignored by Git)
├── 📄 ecosystem.config.cjs    # PM2 production config
└── 📄 CONFIG_GUIDE.md         # Detailed configuration guide
```

## 🔧 Available Scripts

### Development
```bash
npm run dev          # Start all development servers
npm run dev:client   # Frontend only
npm run api          # Activity upload server only
npm run auth         # Auth server only
```

### Production
```bash
npm run build        # Build for production
npm run start        # Start with PM2
npm run stop         # Stop PM2 processes
```

### Utilities
```bash
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm run validate     # Run lint + format check
```

### Management
```bash
npm run pm2:status   # Check PM2 status
npm run pm2:logs     # View PM2 logs
npm run pm2:restart  # Restart PM2 processes
npm run create-admin  # Create admin user script
npm run check-env     # Validate environment variables
```

## 🔧 Configuration

### Environment Variables

Lihat `CONFIG_GUIDE.md` untuk panduan lengkap konfigurasi.

**Kategori Konfigurasi:**
- 🔧 **Server Configuration**: Ports, hosts, environment
- 🔐 **Authentication**: JWT, cookies, admin emails
- 🌐 **API & URLs**: Supabase, auth server, CORS
- 🤖 **AI Configuration**: Gemini API settings
- 📁 **File Upload**: Size limits, allowed types

### Port Configuration

Default ports yang digunakan:
| Service | Port | Environment Variable |
|---------|-------|---------------------|
| Frontend | 5173 | `FRONTEND_PORT` |
| Auth API | 3002 | `AUTH_SERVER_PORT` |
| File Upload API | 3001 | `ACTIVITY_SERVER_PORT` |

## 🚀 Production Deployment

### Using PM2 (Recommended)

1. **Setup Production Environment**
   ```bash
   # Copy dan edit production environment
   cp .env.example .env.production
   
   # Edit dengan production values
   NODE_ENV=production
   COOKIE_SECURE=true
   CORS_ORIGIN=https://yourdomain.com
   ```

2. **Build & Deploy**
   ```bash
   npm run build
   npm run start
   ```

3. **Monitor Deployment**
   ```bash
   npm run pm2:status
   npm run pm2:logs
   ```

### Manual Deployment

```bash
# Build frontend
npm run build

# Start servers manually
NODE_ENV=production node server/auth-server.js &
NODE_ENV=production node server/activity-upload-server.js &
serve -s dist -l 5173
```

## 🔍 Development Tips

### Common Issues & Solutions

1. **Port Conflicts**
   ```bash
   # Ubah port di .env
   AUTH_SERVER_PORT=3003
   ACTIVITY_SERVER_PORT=3004
   ```

2. **CORS Issues**
   ```bash
   # Tambahkan origin ke CORS_ORIGIN
   CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.100:5173
   ```

3. **Environment Issues**
   ```bash
   # Validasi environment variables
   npm run check-env
   ```

### Development Workflow

1. **Feature Development**
   ```bash
   # Create feature branch
   git checkout -b feature/new-feature
   
   # Develop with hot reload
   npm run dev
   
   # Test changes
   # Lint & format
   npm run validate
   ```

2. **Before Commit**
   ```bash
   # Run all checks
   npm run validate
   
   # Add changes
   git add .
   git commit -m "feat: add new feature"
   ```

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 Documentation

- **`CONFIG_GUIDE.md`** - Panduan konfigurasi lengkap
- **`Rangkuman_proyek.md`** - Overview teknis proyek
- **`dokumentasi.md`** - Documentation detail

## 🐛 Troubleshooting

### Getting Help

Jika mengalami masalah:

1. **Check Environment**
   ```bash
   npm run check-env
   ```

2. **Check Logs**
   ```bash
   # Development logs
   npm run dev
   
   # Production logs
   npm run pm2:logs
   ```

3. **Reset Configuration**
   ```bash
   # Reset ke default
   cp .env.example .env
   ```

4. **Clear Cache**
   ```bash
   # Clear node modules
   rm -rf node_modules package-lock.json
   npm install
   ```

## 📄 License

[MIT License](LICENSE)

## 👥 Team

- Development Team
- System Architecture
- DevOps & Deployment

---

**🎉 Happy Coding!**

Untuk pertanyaan atau bantuan tambahan, lihat `CONFIG_GUIDE.md` atau buka issue di repository.
