import { executeQuery } from './_utils/db.js';
import { requireAuth } from './_utils/auth_middleware.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, ...data } = req.body;

    // AUTH CHECKs
    const user = requireAuth(req, res);
    if (!user) return;

    try {
        if (action === 'trainer-tasks') {
            const { trainerId, dateRange = 'week', startDate, endDate } = data;

            // SECURITY: Non-admins can only view their own tasks
            if (user.role !== 'admin' && user.userId !== parseInt(trainerId)) {
                return res.status(403).json({ success: false, error: 'Unauthorized: Cannot view other users reports' });
            }

            const today = new Date();
            let query = `
                SELECT 
                    t.id,
                    t.task_type,
                    t.custom_task_name,
                    t.date,
                    t.remarks,
                    t.admin_query,
                    t.query_status,
                    t.trainer_response,
                    t.created_at,
                    tc.hours,
                    tc.collaborator_type
                FROM tasks t
                JOIN task_collaborators tc ON t.id = tc.task_id
                WHERE tc.user_id = ?
            `;
            const params = [trainerId];

            if (dateRange === 'custom' && startDate && endDate) {
                query += ' AND t.date >= ? AND t.date <= ?';
                params.push(startDate, endDate);
            } else {
                let dateThreshold;
                if (dateRange === 'week') {
                    dateThreshold = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                } else if (dateRange === 'month') {
                    dateThreshold = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                } else if (dateRange === 'today') {
                    dateThreshold = today;
                } else {
                    dateThreshold = new Date('2020-01-01');
                }

                const offset = today.getTimezoneOffset();
                const localDate = new Date(dateThreshold.getTime() - (offset * 60 * 1000));
                const dateThresholdStr = localDate.toISOString().split('T')[0];

                query += ' AND t.date >= ?';
                params.push(dateThresholdStr);
            }

            query += ' ORDER BY t.date DESC, t.created_at DESC';

            const result = await executeQuery(query, params);

            const tasks = result.rows;

            // Calculate stats
            const dailyHours = {};
            tasks.forEach(task => {
                if (!dailyHours[task.date]) {
                    dailyHours[task.date] = 0;
                }
                dailyHours[task.date] += task.hours;
            });

            const tasksWithDailyHours = tasks.map(task => ({
                ...task,
                daily_hours: dailyHours[task.date] || 0
            }));

            const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
            const totalTasks = tasks.length;
            const uniqueDays = new Set(tasks.map(t => t.date)).size;
            const avgHoursPerDay = uniqueDays > 0 ? totalHours / uniqueDays : 0;

            return res.status(200).json({
                success: true,
                tasks: tasksWithDailyHours,
                stats: {
                    totalHours,
                    totalTasks,
                    avgHoursPerDay
                }
            });

        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Reports API error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
