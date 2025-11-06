import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailDomain = '@kemenkopmk.go.id';

  useEffect(() => {
    setMounted(true);
    // Counter animation effect
    const counters = document.querySelectorAll('.counter');
    counters.forEach(counter => {
      const target = counter.textContent;
      if (!target) return;

      const isPercentage = target.includes('%');
      const isPlus = target.includes('+');
      const isTime = target.includes('/');

      let numericValue = parseFloat(target.replace(/[^0-9.]/g, ''));
      if (isNaN(numericValue)) numericValue = 0;

      let current = 0;
      const increment = numericValue / 50;
      const timer = setInterval(() => {
        current += increment;
        if (current >= numericValue) {
          current = numericValue;
          clearInterval(timer);
        }

        const displayValue = Math.floor(current);
        if (isPercentage) {
          counter.textContent = displayValue + '%';
        } else if (isPlus) {
          counter.textContent = displayValue + '+';
        } else if (isTime) {
          counter.textContent = '24/7';
        } else {
          counter.textContent = displayValue + '+';
        }
      }, 30);
    });
  }, []);

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the state to prevent the message from showing again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    const email = `${username}${emailDomain}`;

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-blue-800 to-blue-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div
        className="absolute bottom-20 right-20 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"
        style={{ animationDelay: '2s' }}
      ></div>
      <div
        className="absolute top-1/2 left-1/3 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"
        style={{ animationDelay: '4s' }}
      ></div>

      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-12">
        {/* Left Side - Branding & Information */}
        <div className="flex-1 text-white text-center lg:text-left">
          <div className="mb-8">
            <div className="flex items-center justify-center lg:justify-start mb-6">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 transition-all duration-300 hover:scale-110 hover:bg-white/30">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-20 animate-ping"></div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="relative h-8 w-8 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                  SAPA AI
                </h1>
                <p className="text-sm uppercase tracking-[0.2em] text-blue-200">
                  Sistem Analitik Program & Anggaran
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-4xl font-bold mb-4">
                INOVASI TEKNOLOGI BERBASIS KECERDASAN ARTIFISIAL (KA) UNTUK RENCANA KERJA DAN
                ANGGARAN
              </h2>
              <p className="text-lg text-blue-100 max-w-lg">
                Sistem pemrosesan data anggaran SAKTI dengan kecerdasan buatan untuk{' '}
                <b>
                  Kementerian Koordinator Bidang Pembangunan Manusia dan Kebudayaan Republik
                  Indonesia
                </b>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105 hover:shadow-xl cursor-pointer group">
                <div className="flex items-center mb-2">
                  <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                    <svg
                      className="h-6 w-6 text-blue-300"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold ml-2">Excel Processing</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Pemrosesan file Excel realisasi anggaran SAKTI otomatis
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105 hover:shadow-xl cursor-pointer group">
                <div className="flex items-center mb-2">
                  <div className="p-2 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                    <svg
                      className="h-6 w-6 text-blue-300"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold ml-2">AI Analytics</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Analisis data anggaran dengan kecerdasan buatan
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105 hover:shadow-xl cursor-pointer group">
                <div className="flex items-center mb-2">
                  <div className="p-2 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                    <svg
                      className="h-6 w-6 text-blue-300"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold ml-2">Visualisasi Data</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Dashboard interaktif untuk monitoring real-time
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105 hover:shadow-xl cursor-pointer group">
                <div className="flex items-center mb-2">
                  <div className="p-2 rounded-lg bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
                    <svg
                      className="h-6 w-6 text-blue-300"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold ml-2">Activity Tracking</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Manajemen kegiatan dan alokasi anggaran terpadu
                </p>
              </div>

              {/* Statistics Section */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center transform transition-all duration-500 hover:scale-110">
                  <div className="text-2xl font-bold text-white counter">10K+</div>
                  <div className="text-xs text-blue-200">Fitur</div>
                </div>
                <div className="text-center transform transition-all duration-500 hover:scale-110">
                  <div className="text-2xl font-bold text-white counter">99.9%</div>
                  <div className="text-xs text-blue-200">Akurasi AI</div>
                </div>
                <div className="text-center transform transition-all duration-500 hover:scale-110">
                  <div className="text-2xl font-bold text-white counter">24/7</div>
                  <div className="text-xs text-blue-200">Monitoring</div>
                </div>
                <div className="text-center transform transition-all duration-500 hover:scale-110">
                  <div className="text-2xl font-bold text-white counter">25+</div>
                  <div className="text-xs text-blue-200">Unit Kerja</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex-1 max-w-md">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20 transform transition-all duration-500 hover:scale-[1.02]">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full mb-4 shadow-lg overflow-hidden transform transition-all duration-500 hover:scale-110 hover:shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-20 transition-opacity duration-300 rounded-full"></div>
                <img
                  src="/images/logo-kemenkopmk.png"
                  alt="Logo Kemenko PMK"
                  className="relative h-25 w-25 object-contain z-10"
                />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Masuk ke Dashboard</h2>
              <p className="text-gray-600">
                Akses platform Analitik Program dan Anggaran Kemenko PMK
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">{successMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email-username"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Email Institusi
                </label>
                <div className="flex rounded-lg shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-blue-500 opacity-0 group-focus-within:opacity-10 transition-opacity duration-300"></div>
                  <input
                    id="email-username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="nama.pengguna"
                    required
                    className="relative flex-1 px-4 py-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition z-10"
                  />
                  <span className="relative inline-flex items-center px-3 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 rounded-r-lg text-sm z-10">
                    {emailDomain}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Hanya email institusi Kemenko PMK yang dapat digunakan
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-blue-500 opacity-0 focus-within:opacity-10 transition-opacity duration-300 rounded-lg"></div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    required
                    className="relative w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition shadow-sm z-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="relative w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-medium py-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V2a10 10 0 1010 10h-2a8 8 0 018-8z"
                      ></path>
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Masuk ke Dashboard'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Belum memiliki akun?{' '}
                <Link to="/signup" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  Daftar sekarang
                </Link>
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center mb-4">
                <p className="text-xs text-gray-500 font-medium bg-gradient-to-r from-gray-700 to-gray-500 bg-clip-text text-transparent">
                  Kementerian Koordinator Bidang Pembangunan Manusia dan Kebudayaan Republik
                  Indonesia
                </p>
              </div>
              <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
                <div className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-1 text-green-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span>Aman</span>
                </div>
                <div className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-1 text-blue-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>Cepat</span>
                </div>
                <div className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-1 text-purple-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4V2m0-6V4m6 6v10m6-2A2 2 0 100-4m0 4a2 2 0 110-4m0 4V2m0-6V4"
                    />
                  </svg>
                  <span>Terintegrasi</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
