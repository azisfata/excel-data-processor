import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createAdmin() {
  console.log('=== Membuat Admin Pertama ===\n');

  try {
    // Get Supabase credentials from env
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminEmail = process.env.ADMIN_EMAILS;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Error: VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diset di file .env');
      console.error('\nCara mendapatkan Service Role Key:');
      console.error('1. Buka Supabase Dashboard');
      console.error('2. Pilih project Anda');
      console.error('3. Settings → API');
      console.error('4. Copy "service_role" key (bukan anon key!)');
      console.error('5. Tambahkan ke .env: SUPABASE_SERVICE_ROLE_KEY=your_key_here');
      rl.close();
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin details
    const name = await question('Masukkan nama admin: ');
    const email = adminEmail ? adminEmail.trim() : await question('Masukkan email admin (@kemenkopmk.go.id): ');
    const unit = await question('Masukkan unit kerja (opsional): ');
    const password = await question('Masukkan password (min 6 karakter): ');

    console.log(`\nEmail yang akan digunakan: ${email}`);

    // Validate email
    if (!email.endsWith('@kemenkopmk.go.id')) {
      console.error('\n❌ Error: Email harus menggunakan domain @kemenkopmk.go.id');
      rl.close();
      return;
    }

    // Validate password
    if (password.length < 6) {
      console.error('\n❌ Error: Password minimal 6 karakter');
      rl.close();
      return;
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.trim())
      .single();

    if (existingUser) {
      console.error('\n❌ Error: Email sudah terdaftar');
      rl.close();
      return;
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert admin user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          email: email.trim(),
          password_hash,
          name: name.trim(),
          unit: unit.trim() || null,
          role: 'admin'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('\n❌ Error creating admin:', error.message);
      rl.close();
      return;
    }

    console.log('\n✅ Admin berhasil dibuat!');
    console.log('\nDetail Admin:');
    console.log('- ID:', newUser.id);
    console.log('- Nama:', newUser.name);
    console.log('- Email:', newUser.email);
    console.log('- Unit:', newUser.unit || '-');
    console.log('- Role:', newUser.role);
    console.log('\nAnda sekarang bisa login dengan email dan password yang telah dibuat.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

createAdmin();
