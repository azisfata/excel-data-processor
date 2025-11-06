import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthApiUrl } from '../config/authApi';

const SignupPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    unit: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    otp: '',
  });
  const [error, setError] = useState('');
  const [otpStatus, setOtpStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();
  const emailDomain = '@kemenkopmk.go.id';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  useEffect(() => {
    if (otpCountdown <= 0) return;

    const timer = setInterval(() => {
      setOtpCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [otpCountdown]);

  const handleSendOtp = async () => {
    setOtpStatus(null);
    const trimmedName = formData.name.trim();
    const sanitizedPhone = formData.phoneNumber.replace(/\D/g, '');

    if (!sanitizedPhone) {
      setOtpStatus({ type: 'error', message: 'Nomor WhatsApp wajib diisi.' });
      return;
    }

    if (sanitizedPhone.length < 9) {
      setOtpStatus({ type: 'error', message: 'Nomor WhatsApp tidak valid.' });
      return;
    }

    setOtpLoading(true);
    try {
      const response = await fetch(getAuthApiUrl('auth/request-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formData.phoneNumber,
          name: trimmedName || formData.username || 'Pengguna SAPA',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Gagal mengirim OTP');
      }

      setOtpSent(true);
      setOtpCountdown(60);
      setOtpStatus({
        type: 'success',
        message: 'OTP berhasil dikirim. Silakan cek WhatsApp Anda.',
      });
    } catch (err: any) {
      setOtpStatus({ type: 'error', message: err.message || 'Gagal mengirim OTP' });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const email = `${formData.username}${emailDomain}`;

    if (!formData.username) {
      setError('Nama pengguna email tidak boleh kosong');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Password dan konfirmasi password tidak sama');
      return;
    }

    if (!formData.phoneNumber) {
      setError('Nomor WhatsApp wajib diisi');
      return;
    }

    if (!formData.otp) {
      setError('Kode OTP wajib diisi');
      return;
    }

    if (!otpSent) {
      setError('Silakan kirim OTP ke nomor WhatsApp Anda terlebih dahulu');
      return;
    }

    setLoading(true);

    try {
      await signup({
        email,
        password: formData.password,
        name: formData.name,
        unit: formData.unit,
        phoneNumber: formData.phoneNumber,
        otp: formData.otp,
      });
      navigate('/login', {
        state: {
          message:
            'Pendaftaran berhasil! Akun Anda harus disetujui oleh admin sebelum Anda dapat login.',
        },
      });
    } catch (err: any) {
      setError(err.message || 'Registrasi gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Daftar Akun Baru</h1>
          <p className="text-gray-600">Silakan lengkapi data Anda</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {otpStatus && (
            <div
              className={`p-3 rounded-lg text-sm ${
                otpStatus.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}
            >
              {otpStatus.message}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="Masukkan nama lengkap"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label
              htmlFor="email-username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <div className="flex">
              <input
                id="email-username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                placeholder="nama.pengguna"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
              <span className="inline-flex items-center px-3 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 rounded-r-lg">
                {emailDomain}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Hanya email @kemenkopmk.go.id yang diperbolehkan
            </p>
          </div>

          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">
              Unit Kerja
            </label>
            <input
              id="unit"
              name="unit"
              type="text"
              value={formData.unit}
              onChange={handleChange}
              placeholder="Contoh: Biro Perencanaan"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Nomor WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              inputMode="tel"
              value={formData.phoneNumber}
              onChange={handleChange}
              placeholder="Contoh: 628123456789"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpLoading || otpCountdown > 0}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {otpLoading
                  ? 'Mengirim...'
                  : otpCountdown > 0
                    ? `Kirim Ulang (${otpCountdown})`
                    : 'Kirim OTP'}
              </button>
              <input
                id="otp"
                name="otp"
                type="text"
                value={formData.otp}
                onChange={handleChange}
                placeholder="Kode OTP"
                required
                className="mt-3 sm:mt-0 flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition tracking-widest sm:w-60"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              OTP akan dikirim melalui WhatsApp dan berlaku selama 5 menit.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Minimal 6 karakter"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Konfirmasi Password <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Ulangi password"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Memproses...' : 'Daftar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Sudah punya akun?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Login di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
