import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthApiUrl } from '../config/authApi';

type StatusMessage = {
  type: 'success' | 'error' | 'warning';
  message: string;
  autoHide?: boolean;
};

type ValidationRule = {
  isValid: boolean;
  message: string;
};

const AccountSettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [profileForm, setProfileForm] = useState({
    name: '',
  });
  const [profileStatus, setProfileStatus] = useState<StatusMessage | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [nameValidation, setNameValidation] = useState<ValidationRule | null>(null);
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordStrength, setPasswordStrength] = useState<ValidationRule | null>(null);

  const [phoneForm, setPhoneForm] = useState({
    phoneNumber: '',
    otp: '',
  });
  const [otpStatus, setOtpStatus] = useState<StatusMessage | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<StatusMessage | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneValidation, setPhoneValidation] = useState<ValidationRule | null>(null);

  useEffect(() => {
    setProfileForm({ name: user?.name || '' });
  }, [user?.name]);

  useEffect(() => {
    setPhoneForm(prev => ({
      ...prev,
      phoneNumber: user?.phone_number || '',
    }));
  }, [user?.phone_number]);

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

  // Auto-hide success messages
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    if (profileStatus?.type === 'success' && profileStatus.autoHide !== false) {
      const timer = setTimeout(() => setProfileStatus(null), 5000);
      timers.push(timer);
    }
    
    if (passwordStatus?.type === 'success' && passwordStatus.autoHide !== false) {
      const timer = setTimeout(() => setPasswordStatus(null), 5000);
      timers.push(timer);
    }
    
    if (phoneStatus?.type === 'success' && phoneStatus.autoHide !== false) {
      const timer = setTimeout(() => setPhoneStatus(null), 5000);
      timers.push(timer);
    }
    
    if (otpStatus?.type === 'success' && otpStatus.autoHide !== false) {
      const timer = setTimeout(() => setOtpStatus(null), 5000);
      timers.push(timer);
    }

    return () => timers.forEach(timer => clearTimeout(timer));
  }, [profileStatus, passwordStatus, phoneStatus, otpStatus]);

  // Real-time validation functions
  const validateName = useCallback((name: string): ValidationRule => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { isValid: false, message: 'Nama tidak boleh kosong.' };
    }
    if (trimmedName.length < 3) {
      return { isValid: false, message: 'Nama minimal 3 karakter.' };
    }
    if (trimmedName.length > 50) {
      return { isValid: false, message: 'Nama maksimal 50 karakter.' };
    }
    return { isValid: true, message: '' };
  }, []);

  const validatePassword = useCallback((password: string): ValidationRule => {
    if (password.length < 6) {
      return { isValid: false, message: 'Password minimal 6 karakter.' };
    }
    if (password.length > 100) {
      return { isValid: false, message: 'Password maksimal 100 karakter.' };
    }
    
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!hasLetter || !hasNumber) {
      return { 
        isValid: false, 
        message: 'Password harus mengandung huruf dan angka.' 
      };
    }
    
    if (password.length >= 8 && hasLetter && hasNumber && hasSpecial) {
      return { isValid: true, message: 'Password sangat kuat ✓' };
    } else if (password.length >= 6 && hasLetter && hasNumber) {
      return { isValid: true, message: 'Password kuat ✓' };
    }
    
    return { isValid: true, message: 'Password cukup kuat' };
  }, []);

  const validatePhoneNumber = useCallback((phone: string): ValidationRule => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      return { isValid: false, message: 'Nomor WhatsApp wajib diisi.' };
    }
    if (cleanPhone.length < 10) {
      return { isValid: false, message: 'Nomor WhatsApp minimal 10 digit.' };
    }
    if (cleanPhone.length > 15) {
      return { isValid: false, message: 'Nomor WhatsApp maksimal 15 digit.' };
    }
    if (!cleanPhone.startsWith('08') && !cleanPhone.startsWith('62')) {
      return { isValid: false, message: 'Nomor WhatsApp harus dimulai dengan 08 atau 62.' };
    }
    return { isValid: true, message: 'Format nomor valid ✓' };
  }, []);

  // Real-time validation handlers
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setProfileForm({ name });
    setNameValidation(validateName(name));
  }, [validateName]);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setPasswordForm(prev => ({ ...prev, newPassword: password }));
    const validation = validatePassword(password);
    setPasswordStrength(validation);
  }, [validatePassword]);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Smart auto-format phone number based on input
    let phone = e.target.value;
    
    // Remove all non-digit characters
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    // Smart auto-format: only add leading 0 if input starts with digit and doesn't start with valid prefix
    let formattedPhone = cleanPhone;
    if (cleanPhone.length > 0) {
      // If number doesn't start with 08 or 62, add leading 0
  }, [validatePhoneNumber]);

  const togglePasswordVisibility = useCallback((field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          <p className="text-gray-600">Memuat data akun...</p>
        </div>
      </div>
    );
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);

    const validation = validateName(profileForm.name);
    if (!validation.isValid) {
      setProfileStatus({ type: 'error', message: validation.message });
      return;
    }

    setProfileLoading(true);
    try {
      const response = await fetch(getAuthApiUrl('auth/update-profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: profileForm.name.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memperbarui nama.');
      }

      setProfileStatus({
        type: 'success',
        message: data.message || '✅ Nama berhasil diperbarui.',
        autoHide: true,
      });
      setProfileForm({ name: data.user?.name || profileForm.name.trim() });
      setNameValidation(null);
      await refreshUser();
    } catch (error: any) {
      setProfileStatus({
        type: 'error',
        message: error.message || 'Gagal memperbarui nama.',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordStatus({ type: 'error', message: 'Semua kolom password wajib diisi.' });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Password baru minimal 6 karakter.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Konfirmasi password tidak sesuai.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await fetch(getAuthApiUrl('auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memperbarui password.');
      }

      setPasswordStatus({
        type: 'success',
        message: data.message || 'Password berhasil diperbarui.',
      });
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      setPasswordStatus({
        type: 'error',
        message: error.message || 'Gagal memperbarui password.',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setOtpStatus(null);
    setPhoneStatus(null);

    if (!phoneForm.phoneNumber.trim()) {
      setOtpStatus({ type: 'error', message: 'Nomor WhatsApp wajib diisi.' });
      return;
    }

    setOtpLoading(true);
    try {
      const response = await fetch(getAuthApiUrl('auth/request-phone-change-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: phoneForm.phoneNumber }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Gagal mengirim OTP.');
      }

      setOtpSent(true);
      setOtpCountdown(60);
      setOtpStatus({
        type: 'success',
        message: data.message || 'OTP berhasil dikirim. Silakan cek WhatsApp Anda.',
      });
    } catch (error: any) {
      setOtpStatus({
        type: 'error',
        message: error.message || 'Gagal mengirim OTP.',
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneStatus(null);

    if (!phoneForm.phoneNumber.trim()) {
      setPhoneStatus({ type: 'error', message: 'Nomor WhatsApp baru wajib diisi.' });
      return;
    }

    if (!phoneForm.otp.trim()) {
      setPhoneStatus({ type: 'error', message: 'Kode OTP wajib diisi.' });
      return;
    }

    if (!otpSent) {
      setPhoneStatus({ type: 'error', message: 'Silakan kirim OTP terlebih dahulu.' });
      return;
    }

    setPhoneLoading(true);
    try {
      const response = await fetch(getAuthApiUrl('auth/change-phone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phoneNumber: phoneForm.phoneNumber,
          otp: phoneForm.otp,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memperbarui nomor WhatsApp.');
      }

      setPhoneStatus({
        type: 'success',
        message: data.message || 'Nomor WhatsApp berhasil diperbarui.',
      });
      setOtpSent(false);
      setOtpCountdown(0);
      setOtpStatus(null);
      setPhoneForm(prev => ({
        phoneNumber: data.user?.phone_number || prev.phoneNumber,
        otp: '',
      }));
      await refreshUser();
    } catch (error: any) {
      setPhoneStatus({
        type: 'error',
        message: error.message || 'Gagal memperbarui nomor WhatsApp.',
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header dengan navigasi dan info user */}
        <header className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
            >
              <svg
                className="w-4 h-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Kembali ke Dashboard
            </button>
            <div className="flex items-center gap-6">
              <div className="text-sm text-gray-500">
                <span className="font-medium">Email:</span>{' '}
                <span className="text-gray-700">{user?.email || 'N/A'}</span>
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-medium">WhatsApp:</span>{' '}
                <span className="text-gray-700">{user.phone_number || 'Belum tersimpan'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Page Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426-1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 3.362-1.258.954-2.905-1.254-3.654zm1.258 1.258l4.08 4.08m-4.08-4.08l4.08 4.08" />
                </svg>
              </div>
              <div className="text-white">
                <h1 className="text-2xl font-bold mb-1">Pengaturan Akun</h1>
                <p className="text-indigo-100 text-sm">
                  Kelola kredensial akses SAPA AI Anda. Pastikan data terbaru agar notifikasi WhatsApp tetap diterima.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-8">
            {/* Profile Section */}
            <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 rounded-lg p-2">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">Informasi Profil</h2>
                  <p className="text-sm text-gray-600">Perbarui nama tampilan Anda di SAPA AI.</p>
                </div>
              </div>

              {profileStatus && (
                <div
                  className={`p-4 rounded-lg text-sm flex items-start gap-2 ${
                    profileStatus.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    {profileStatus.type === 'success' ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>{profileStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nama Lengkap
                    <span className="text-gray-400 text-xs ml-2">({profileForm.name.length}/50)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={handleNameChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm ${
                        nameValidation && !nameValidation.isValid
                          ? 'border-red-300 bg-red-50'
                          : nameValidation?.isValid
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300'
                      }`}
                      placeholder="Masukkan nama baru"
                      required
                      aria-describedby={nameValidation ? 'name-validation' : undefined}
                    />
                    {nameValidation && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        {nameValidation.isValid ? (
                          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                  {nameValidation && nameValidation.message && (
                    <p id="name-validation" className={`text-xs mt-2 ${nameValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {nameValidation.message}
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={profileLoading || (nameValidation && !nameValidation.isValid)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {profileLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Simpan Nama
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            {/* Password Section */}
            <section className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-amber-100 rounded-lg p-2">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">Ubah Password</h2>
                  <p className="text-sm text-gray-600">
                    Gunakan kombinasi huruf dan angka minimal 6 karakter untuk keamanan maksimum.
                  </p>
                </div>
              </div>

              {passwordStatus && (
                <div
                  className={`p-4 rounded-lg text-sm flex items-start gap-2 ${
                    passwordStatus.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    {passwordStatus.type === 'success' ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password Saat Ini
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={e =>
                        setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))
                      }
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition text-sm"
                      placeholder="Masukkan password lama"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('current')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Toggle password visibility"
                    >
                      {showPasswords.current ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password Baru
                    <span className="text-gray-400 text-xs ml-2">({passwordForm.newPassword.length}/100)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={handlePasswordChange}
                      className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition text-sm ${
                        passwordStrength && !passwordStrength.isValid
                          ? 'border-red-300 bg-red-50'
                          : passwordStrength?.isValid && passwordStrength.message.includes('kuat')
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300'
                      }`}
                      placeholder="Minimal 6 karakter"
                      required
                      aria-describedby={passwordStrength ? 'password-strength' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('new')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Toggle password visibility"
                    >
                      {showPasswords.new ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {passwordStrength && passwordStrength.message && (
                    <p id="password-strength" className={`text-xs mt-2 flex items-center gap-1 ${
                      passwordStrength.isValid && passwordStrength.message.includes('sangat kuat')
                        ? 'text-green-600'
                        : passwordStrength.isValid
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}>
                      {passwordStrength.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Konfirmasi Password Baru
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={e =>
                        setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))
                      }
                      className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition text-sm ${
                        passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword
                          ? 'border-red-300 bg-red-50'
                          : passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300'
                      }`}
                      placeholder="Ulangi password baru"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('confirm')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Toggle password visibility"
                    >
                      {showPasswords.confirm ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {passwordForm.confirmPassword && (
                    <p className={`text-xs mt-2 flex items-center gap-1 ${
                      passwordForm.newPassword === passwordForm.confirmPassword
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {passwordForm.newPassword === passwordForm.confirmPassword ? (
                        <>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Password cocok
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Password tidak cocok
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      passwordLoading ||
                      !passwordForm.currentPassword ||
                      !passwordForm.newPassword ||
                      !passwordForm.confirmPassword ||
                      (passwordStrength && !passwordStrength.isValid) ||
                      passwordForm.newPassword !== passwordForm.confirmPassword
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-600 text-white font-semibold shadow-lg hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {passwordLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Simpan Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            {/* Phone Section */}
            <section className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-100 rounded-lg p-2">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">Ubah Nomor WhatsApp</h2>
                  <p className="text-sm text-gray-600">
                    Nomor ini digunakan untuk menerima OTP dan notifikasi otomatis dari SAPA AI.
                  </p>
                </div>
              </div>

              {otpStatus && (
                <div
                  className={`p-4 rounded-lg text-sm flex items-start gap-2 ${
                    otpStatus.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    {otpStatus.type === 'success' ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>{otpStatus.message}</span>
                </div>
              )}

              {phoneStatus && (
                <div
                  className={`p-4 rounded-lg text-sm flex items-start gap-2 ${
                    phoneStatus.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    {phoneStatus.type === 'success' ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>{phoneStatus.message}</span>
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nomor WhatsApp Baru
                    <span className="text-gray-400 text-xs ml-2">
                      ({phoneForm.phoneNumber.replace(/\D/g, '').length}/15 digit)
                    </span>
                  </label>
                  <div className="mb-2">
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                      <span className="font-semibold">ℹ️ Format yang valid:</span>
                      <ul className="mt-1 space-y-1">
                        <li>• Awalan <strong>08</strong> untuk nomor seluler Indonesia</li>
                        <li>• Awalan <strong>62</strong> untuk nomor khusus Smartfren</li>
                        <li>• Minimal 10 digit, maksimal 15 digit</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <input
                        type="tel"
                        value={phoneForm.phoneNumber}
                        onChange={handlePhoneChange}
                        className={`w-full pl-10 pr-10 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition text-sm ${
                          phoneValidation && !phoneValidation.isValid
                            ? 'border-red-300 bg-red-50'
                            : phoneValidation?.isValid
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-300'
                        }`}
                        placeholder="Contoh: 08123456789 atau 62812345678"
                        aria-describedby={phoneValidation ? 'phone-validation' : undefined}
                      />
                      {phoneValidation && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          {phoneValidation.isValid ? (
                            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpLoading || otpCountdown > 0 || (phoneValidation && !phoneValidation.isValid)}
                      className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-emerald-200 text-emerald-600 font-medium hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {otpLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Mengirim...
                        </>
                      ) : otpCountdown > 0 ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Kirim ulang ({otpCountdown}s)
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Kirim OTP
                        </>
                      )}
                    </button>
                  </div>
                  {phoneValidation && phoneValidation.message && (
                    <p id="phone-validation" className={`text-xs mt-2 ${phoneValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {phoneValidation.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Kode OTP
                    <span className="text-gray-400 text-xs ml-2">({phoneForm.otp.length}/6 digit)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={phoneForm.otp}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPhoneForm(prev => ({ ...prev, otp: value }));
                      }}
                      className={`w-full pl-10 pr-10 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition tracking-widest text-center text-lg font-mono text-sm ${
                        phoneForm.otp.length === 6
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300'
                      }`}
                      placeholder="------"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                    {phoneForm.otp.length === 6 && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {phoneForm.otp.length > 0 && phoneForm.otp.length < 6 && (
                    <p className="text-xs mt-2 text-amber-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Masukkan {6 - phoneForm.otp.length} digit lagi
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      phoneLoading ||
                      !phoneForm.phoneNumber.trim() ||
                      !phoneForm.otp.trim() ||
                      phoneForm.otp.length !== 6 ||
                      !otpSent ||
                      (phoneValidation && !phoneValidation.isValid)
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold shadow-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {phoneLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        Simpan Nomor WA
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AccountSettingsPage;
