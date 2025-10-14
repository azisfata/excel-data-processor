
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const emailToUpdate = 'azisfata@kemenkopmk.go.id';
const newPassword = 'admin123';

async function resetPassword() {
  if (!emailToUpdate || !newPassword) {
    console.error('Email and new password must be provided in the script.');
    return;
  }

  console.log(`Attempting to reset password for: ${emailToUpdate}`);

  try {
    // Hash the new password
    const password_hash = await bcrypt.hash(newPassword, 10);
    console.log('Password hashed successfully.');

    // Update the user in the database
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: password_hash })
      .eq('email', emailToUpdate)
      .select();

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      console.error(`Error: User with email "${emailToUpdate}" not found.`);
      return;
    }

    console.log(`✅ Successfully updated password for ${emailToUpdate}.`);
    console.log('You should now be able to log in with your new password.');

  } catch (error) {
    console.error('An error occurred during password reset:', error.message);
  }
}

resetPassword();
