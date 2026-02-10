
import { createClient } from '@libsql/client';
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
            envVars[match[1].trim()] = match[2].trim();
        }
    }
});

const DATABASE_URL = envVars.VITE_TURSO_DATABASE_URL;
const AUTH_TOKEN = envVars.VITE_TURSO_AUTH_TOKEN;

if (!DATABASE_URL) {
    console.error('Error: VITE_TURSO_DATABASE_URL not found');
    process.exit(1);
}

const client = createClient({
    url: DATABASE_URL,
    authToken: AUTH_TOKEN,
});

async function verify() {
    try {
        console.log('Connecting to:', DATABASE_URL);
        const result = await client.execute("SELECT * FROM users WHERE role = 'admin'");
        if (result.rows.length > 0) {
            console.log('✅ Admin User Found:', result.rows[0].name);
            console.log('✅ Remote Connection Success!');
        } else {
            console.error('❌ Admin user NOT found in remote DB.');
        }
    } catch (e) {
        console.error('❌ Connection Failed:', e);
    }
}

verify();
