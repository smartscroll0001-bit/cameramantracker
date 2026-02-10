
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

console.log('Loading .env from:', envPath);
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    }
});

const DATABASE_URL = process.env.VITE_TURSO_DATABASE_URL;
const AUTH_TOKEN = process.env.VITE_TURSO_AUTH_TOKEN;

if (!DATABASE_URL) {
    console.error('Error: VITE_TURSO_DATABASE_URL not found');
    process.exit(1);
}

const client = createClient({
    url: DATABASE_URL,
    authToken: AUTH_TOKEN || undefined,
});

async function testLogin(jsId, password) {
    console.log(`\nTesting login for JS ID: ${jsId}`);
    try {
        // 1. Fetch user
        const result = await client.execute({
            sql: 'SELECT * FROM users WHERE js_id = ?',
            args: [jsId]
        });

        if (result.rows.length === 0) {
            console.error('❌ User not found');
            return;
        }

        const user = result.rows[0];
        console.log('✅ User found:', user.name, 'Role:', user.role);
        console.log('   Stored Hash:', user.password_hash);

        // 2. Check password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (isValid) {
            console.log('✅ Password Match! Login Successful.');
        } else {
            console.error('❌ Password Mismatch.');
            // Generate what the hash SHOULD be for debugging
            const newHash = await bcrypt.hash(password, 10);
            console.log('   Note: If you were to hash the input password, it would look different (salt).');
        }

    } catch (error) {
        console.error('❌ Error during login test:', error);
    }
}

// Run test
testLogin('admin', 'surajrawat001');
