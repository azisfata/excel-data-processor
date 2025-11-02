import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { randomInt, createHash } from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.AUTH_SERVER_PORT ? Number(process.env.AUTH_SERVER_PORT) : 3002;

// JWT Secret - dalam production, simpan di environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE.toLowerCase() === 'true'
  : process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN
  ? process.env.COOKIE_DOMAIN.trim() || undefined
  : undefined;
const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE?.trim() || 'lax';

const getBaseCookieOptions = () => {
  const options = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE
  };

  if (COOKIE_DOMAIN) {
    options.domain = COOKIE_DOMAIN;
  }

  return options;
};

// Supabase client (hanya untuk query database, bukan auth)
// Menggunakan service_role key untuk bypass RLS di server-side
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (atau VITE_SUPABASE_ANON_KEY) harus diset di file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 menit
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 detik
const OTP_MAX_ATTEMPTS = 5;
const FONNTE_API_URL = process.env.FONNTE_API_URL || 'https://api.fonnte.com/send';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;

const otpStore = new Map();

const normalizePhoneNumber = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  return `62${digits}`;
};

const hashOtp = (otp) => createHash('sha256').update(otp).digest('hex');

const generateOtp = () => String(randomInt(100000, 1000000));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:5173',
      'http://192.168.10.149:5173',
      'http://127.0.0.1:5173',
      'http://172.2.17.175:5173',
      process.env.CORS_ORIGIN || 'http://localhost:3000' // Production domain
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Middleware untuk verifikasi token
const authenticateToken = (req, res, next) => {
  const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token tidak valid' });
  }
};

// Middleware untuk verifikasi admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin yang dapat mengakses.' });
  }
  next();
};

// Validasi email domain
const isValidEmail = (email) => {
  return email.endsWith('@kemenkopmk.go.id');
};

app.post('/api/auth/request-otp', async (req, res) => {
  try {
    if (!FONNTE_TOKEN) {
      return res.status(500).json({ error: 'FONNTE_TOKEN belum dikonfigurasi di server.' });
    }

    const { phoneNumber, name } = req.body || {};
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid.' });
    }

    const { data: existingPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .maybeSingle();

    if (existingPhone) {
      return res.status(409).json({ error: 'Nomor WhatsApp ini sudah terdaftar.' });
    }

    const now = Date.now();
    const existingOtp = otpStore.get(normalizedPhone);
    if (existingOtp && now - existingOtp.lastSent < OTP_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (now - existingOtp.lastSent)) / 1000
      );
      return res.status(429).json({
        error: `Harap tunggu ${waitSeconds} detik sebelum meminta OTP lagi.`
      });
    }

    const otp = generateOtp();
    const messageName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Pengguna SAPA';
    const message = `Halo ${messageName}, kode OTP SAPA Anda adalah ${otp}. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`;

    const response = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: FONNTE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: normalizedPhone,
        message
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('FONNTE OTP send error:', response.status, detail);
      return res.status(502).json({
        error: 'Gagal mengirim OTP melalui FONNTE. Silakan coba lagi.',
        detail: detail ? detail.slice(0, 200) : undefined
      });
    }

    otpStore.set(normalizedPhone, {
      otpHash: hashOtp(otp),
      expiresAt: now + OTP_EXPIRY_MS,
      attempts: 0,
      lastSent: now
    });

    res.json({ success: true, message: 'OTP berhasil dikirim.' });
  } catch (error) {
    console.error('request-otp error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat mengirim OTP.' });
  }
});

// POST /api/auth/signup - Registrasi user baru
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, unit, phoneNumber, otp } = req.body;

    // Validasi input
    if (!email || !password || !name || !phoneNumber || !otp) {
      return res.status(400).json({ error: 'Email, password, nama, nomor WhatsApp, dan OTP wajib diisi' });
    }

    // Validasi domain email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan' });
    }

    // Validasi panjang password
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
    }

    const otpEntry = otpStore.get(normalizedPhone);
    if (!otpEntry) {
      return res.status(400).json({ error: 'OTP belum diminta atau sudah kadaluarsa' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(normalizedPhone);
      return res.status(400).json({ error: 'OTP sudah kadaluarsa. Silakan minta ulang.' });
    }

    if (otpEntry.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(normalizedPhone);
      return res.status(429).json({ error: 'Percobaan OTP terlalu banyak. Silakan minta OTP baru.' });
    }

    if (hashOtp(String(otp).trim()) !== otpEntry.otpHash) {
      otpEntry.attempts += 1;
      otpStore.set(normalizedPhone, otpEntry);
      return res.status(400).json({ error: 'Kode OTP tidak valid.' });
    }

    otpStore.delete(normalizedPhone);

    // Cek apakah email sudah terdaftar
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const { data: existingPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .maybeSingle();

    if (existingPhone) {
      return res.status(400).json({ error: 'Nomor WhatsApp sudah digunakan oleh akun lain' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Cek apakah email termasuk dalam daftar admin
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
    const isAutoApprovedAdmin = adminEmails.includes(email);

    const newUserPayload = {
      email,
      password_hash,
      name,
      unit: unit || null,
      role: isAutoApprovedAdmin ? 'admin' : 'user',
      is_approved: isAutoApprovedAdmin,
      phone_number: normalizedPhone
    };

    // Insert user baru
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([newUserPayload])
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({ error: 'Gagal membuat user' });
    }

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        unit: newUser.unit,
        role: newUser.role,
        is_approved: newUser.is_approved
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/login - Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validasi input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Validasi domain email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan' });
    }

    // Cari user berdasarkan email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ error: 'Akun Anda belum disetujui oleh admin.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        isApproved: true
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('auth_token', token, {
      ...getBaseCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login berhasil',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        unit: user.unit,
        role: user.role,
        is_approved: user.is_approved
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/logout - Logout user
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token', getBaseCookieOptions());
  res.json({ message: 'Logout berhasil' });
});

// GET /api/auth/me - Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, unit, role, created_at, is_approved')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    // Tambahan keamanan: jika karena suatu alasan user yang belum disetujui memiliki token,
    // tolak akses dan bersihkan cookie mereka.
    if (!user.is_approved) {
      res.clearCookie('auth_token', getBaseCookieOptions());
      return res.status(403).json({ error: 'Akun Anda belum disetujui oleh admin.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

const userRouter = express.Router();

userRouter.use(authenticateToken);
userRouter.use(requireAdmin);

// GET /users - Get all users (admin only)
userRouter.get('/', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, unit, role, created_at, is_approved')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Gagal mengambil data user' });
    }

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /users/:id/approve - Approve user (admin only)
userRouter.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ is_approved: true })
      .eq('id', id)
      .select('id, email, name, unit, role, created_at, is_approved')
      .single();

    if (error) {
      console.error('Error approving user:', error);
      return res.status(500).json({ error: 'Gagal menyetujui user' });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json({
      message: 'User berhasil disetujui',
      user: updatedUser
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /users - Create user (admin only)
userRouter.post('/', async (req, res) => {
  try {
    const { email, password, name, unit, role, is_approved } = req.body;

    // Validasi input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, dan nama wajib diisi' });
    }

    // Validasi domain email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan' });
    }

    // Validasi role
    const validRoles = ['admin', 'user', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    // Cek apakah email sudah terdaftar
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user baru
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          email,
          password_hash,
          name,
          unit: unit || null,
          role: role || 'user',
          is_approved: true
        }
      ])
      .select('id, email, name, unit, role, created_at, is_approved')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({ error: 'Gagal membuat user' });
    }

    res.status(201).json({
      message: 'User berhasil dibuat',
      user: newUser
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /users/:id - Update user (admin only)
userRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, name, unit, role, is_approved } = req.body;

    // Validasi input
    if (!name) {
      return res.status(400).json({ error: 'Nama wajib diisi' });
    }

    // Validasi domain email jika email diubah
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan' });
    }

    // Validasi role
    const validRoles = ['admin', 'user', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    // Cek apakah email sudah digunakan user lain
    if (email) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Email sudah digunakan user lain' });
      }
    }

    // Prepare update data
    const updateData = {
      name,
      unit: unit || null,
    };

    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    if (typeof is_approved === 'boolean') {
      updateData.is_approved = is_approved;
    }

    // Update user
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, unit, role, created_at, is_approved')
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ error: 'Gagal mengupdate user' });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json({
      message: 'User berhasil diupdate',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// DELETE /users/:id - Delete user (admin only)
userRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Cegah admin menghapus dirinya sendiri
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri' });
    }

    // Delete user
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({ error: 'Gagal menghapus user' });
    }

    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

app.use('/api/users', userRouter);
app.use('/api/auth/users', userRouter);

app.listen(PORT, () => {
  console.log(`Auth server listening on port ${PORT}`);
});
