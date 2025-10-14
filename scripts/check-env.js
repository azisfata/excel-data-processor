import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('=== Environment Variables Check ===\n');

const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'JWT_SECRET',
  'ADMIN_EMAILS'
];

let allPresent = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const displayValue = varName.includes('KEY') || varName.includes('SECRET') 
      ? `${value.substring(0, 20)}...` 
      : value;
    console.log(`✅ ${varName}: ${displayValue}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
    allPresent = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allPresent) {
  console.log('✅ Semua environment variables sudah diset!');
  console.log('\nAnda bisa menjalankan:');
  console.log('  npm run dev        - Jalankan aplikasi');
  console.log('  npm run create-admin - Buat admin pertama');
} else {
  console.log('❌ Beberapa environment variables belum diset!');
  console.log('\nSilakan update file .env dengan nilai yang benar.');
  console.log('Lihat .env.example untuk referensi.');
}
