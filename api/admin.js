import { executeQuery } from './_utils/db.js';
import { requireAuth } from './_utils/auth_middleware.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, ...data } = req.body;

    // AUTH CHECK: Verify token and Admin Role
    const user = requireAuth(req, res);
    if (!user) return;

    // Most admin actions require admin role
    if (user.role !== 'admin' && action !== 'get-user-queries') {
        return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required' });
    }

    try {
        if (action === 'team-performance') {
            const { date } = data;

            // Optimized query to avoid N+1
            // Optimized query to join task_collaborators to include both primary and secondary tasks
            const query = `
                SELECT 
                    u.id, 
                    u.name, 
                    u.js_id,
                    COALESCE(stats.total_hours, 0) as total_hours,
                    COALESCE(stats.is_leave, 0) as is_leave,
                    COALESCE(stats.is_holiday, 0) as is_holiday,
                    COALESCE(stats.is_half_day, 0) as is_half_day
                FROM users u
                LEFT JOIN (
                    SELECT 
                        tc.user_id,
                        SUM(tc.hours) as total_hours,
                        MAX(CASE WHEN t.task_type = 'Leave' THEN 1 ELSE 0 END) as is_leave,
                        MAX(CASE WHEN t.task_type = 'Holiday' THEN 1 ELSE 0 END) as is_holiday,
                        MAX(CASE WHEN t.task_type = 'Half Day' THEN 1 ELSE 0 END) as is_half_day
                    FROM task_collaborators tc
                    JOIN tasks t ON tc.task_id = t.id
                    WHERE t.date = ?
                    GROUP BY tc.user_id
                ) stats ON u.id = stats.user_id
                WHERE u.role = 'trainer'
                ORDER BY u.name
            `;

            const result = await executeQuery(query, [date]);
            const trainers = result.rows;

            const performance = { underperforming: 0, normal: 0, overperforming: 0, onLeave: 0, holiday: 0 };

            const processedTrainers = trainers.map(t => {
                let status;
                const hours = t.total_hours;

                if (t.is_leave) {
                    performance.onLeave++;
                    status = 'On Leave';
                } else if (t.is_holiday) {
                    performance.holiday++;
                    status = 'Holiday';
                } else {
                    let minHours = 7;
                    let maxHours = 7.5;

                    if (t.is_half_day) {
                        minHours = 3.5;
                        maxHours = 4.5;
                    }

                    if (hours < minHours) {
                        performance.underperforming++;
                        status = 'underperforming';
                    } else if (hours <= maxHours) {
                        performance.normal++;
                        status = 'normal';
                    } else {
                        performance.overperforming++;
                        status = 'overperforming';
                    }
                }

                return {
                    id: t.id,
                    name: t.name,
                    js_id: t.js_id,
                    hours: hours,
                    status,
                    isHalfDay: !!t.is_half_day
                };
            });

            return res.status(200).json({ success: true, performance, trainers: processedTrainers });

        } else if (action === 'team-trends') {
            const { days = 30 } = data;
            const today = new Date();
            const dateThreshold = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
            const offset = today.getTimezoneOffset();
            const localDate = new Date(dateThreshold.getTime() - (offset * 60 * 1000));
            const dateThresholdStr = localDate.toISOString().split('T')[0];

            const query = `
                SELECT 
                    date,
                    SUM(hours) as total_hours,
                    COUNT(DISTINCT user_id) as active_trainers
                FROM tasks
                WHERE date >= ?
                GROUP BY date
                ORDER BY date ASC
            `;

            const result = await executeQuery(query, [dateThresholdStr]);
            return res.status(200).json({ success: true, trends: result.rows });

        } else if (action === 'top-performers') {
            const { period = 'month' } = data;
            const today = new Date();
            let dateThreshold;

            if (period === 'week') {
                dateThreshold = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else {
                dateThreshold = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            }

            const offset = today.getTimezoneOffset();
            const localDate = new Date(dateThreshold.getTime() - (offset * 60 * 1000));
            const dateThresholdStr = localDate.toISOString().split('T')[0];

            const query = `
                SELECT 
                    u.id, 
                    u.name, 
                    ROUND(SUM(t.hours), 1) as total_hours,
                    COUNT(t.id) as tasks_count
                FROM tasks t
                JOIN users u ON t.user_id = u.id
                WHERE t.date >= ?
                GROUP BY u.id, u.name
                ORDER BY total_hours DESC
                LIMIT 5
            `;

            const result = await executeQuery(query, [dateThresholdStr]);
            return res.status(200).json({ success: true, performers: result.rows });

        } else if (action === 'audit-logs') {
            const { limit = 100 } = data;
            const query = `
                SELECT 
                    a.*,
                    u.name as user_name,
                    u.js_id
                FROM audit_logs a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC
                LIMIT ?
            `;
            const result = await executeQuery(query, [limit]);
            return res.status(200).json({ success: true, logs: result.rows });

        } else if (action === 'send-query') {
            const { userId, query } = data;
            const adminId = user.userId;
            await executeQuery(
                'INSERT INTO user_queries (user_id, admin_id, query_text) VALUES (?, ?, ?)',
                [userId, adminId, query]
            );
            return res.status(200).json({ success: true });

        } else if (action === 'dismiss-user-query') {
            // Allow user to dismiss a general query
            const { queryId } = data;
            // Ensure the query belongs to the user requesting dismissal
            await executeQuery(
                "UPDATE user_queries SET is_resolved = 1 WHERE id = ? AND user_id = ?",
                [queryId, user.userId]
            );
            return res.status(200).json({ success: true });

        } else if (action === 'get-user-queries') {
            // New action for fetching queries for a specific user
            const { userId } = data;
            const result = await executeQuery(
                'SELECT * FROM user_queries WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
            return res.status(200).json({ success: true, queries: result.rows });

        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Admin API error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
