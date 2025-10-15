import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3002;

// JWT Secret - dalam production, simpan di environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Supabase client (hanya untuk query database, bukan auth)
// Menggunakan service_role key untuk bypass RLS di server-side
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (atau VITE_SUPABASE_ANON_KEY) harus diset di file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:5173',
      'http://192.168.10.149:5173',
      'http://127.0.0.1:5173',
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

// POST /api/auth/signup - Registrasi user baru
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, unit } = req.body;

    // Validasi input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, dan nama wajib diisi' });
    }

    // Validasi domain email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan' });
    }

    // Validasi panjang password
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
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
          role: 'user' // Default role
        }
      ])
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
        role: newUser.role
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

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });

    res.json({
      message: 'Login berhasil',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        unit: user.unit,
        role: user.role
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
  res.clearCookie('auth_token');
  res.json({ message: 'Logout berhasil' });
});

// GET /api/auth/me - Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, unit, role, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/users - Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, unit, role, created_at')
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

// POST /api/users - Create user (admin only)
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, unit, role } = req.body;

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
          role: role || 'user'
        }
      ])
      .select('id, email, name, unit, role, created_at')
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

// PUT /api/users/:id - Update user (admin only)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, name, unit, role } = req.body;

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

    // Update user
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, name, unit, role, created_at')
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

// DELETE /api/users/:id - Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Auth server listening on port ${PORT}`);
});
