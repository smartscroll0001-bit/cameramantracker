import { createClient } from '@libsql/client';

const client = createClient({
    url: process.env.VITE_TURSO_DATABASE_URL,
    authToken: process.env.VITE_TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
    try {
        const results = [];

        // 1. Add admin_query
        try {
            await client.execute('ALTER TABLE tasks ADD COLUMN admin_query TEXT');
            results.push('Added admin_query');
        } catch (e) {
            results.push(`admin_query: ${e.message}`);
        }

        // 2. Add query_status
        try {
            await client.execute("ALTER TABLE tasks ADD COLUMN query_status TEXT DEFAULT 'resolved' CHECK(query_status IN ('pending', 'resolved'))");
            results.push('Added query_status');
        } catch (e) {
            results.push(`query_status: ${e.message}`);
        }

        // 3. Add trainer_response
        try {
            await client.execute('ALTER TABLE tasks ADD COLUMN trainer_response TEXT');
            results.push('Added trainer_response');
        } catch (e) {
            results.push(`trainer_response: ${e.message}`);
        }

        // 4. Update existing tasks to have resolved status
        try {
            await client.execute("UPDATE tasks SET query_status = 'resolved' WHERE query_status IS NULL");
            results.push('Updated NULL query_status to resolved');
        } catch (e) {
            results.push(`Update status: ${e.message}`);
        }

        return res.status(200).json({ success: true, results });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
