import { executeQuery, executeBatch } from './_utils/db.js';
import { logAction } from './_utils/audit.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, ...data } = req.body;

    try {
        if (action === 'get-user-tasks') {
            const { userId, date } = data;

            // Modified query to join task_collaborators
            // We want tasks where the user is a collaborator (primary or secondary)
            // And we want to show the hours SPECIFIC to this user (from task_collaborators)
            let query = `
                SELECT 
                    t.id, t.user_id as owner_id, t.task_type, t.custom_task_name, 
                    t.date, t.start_time, t.end_time, t.remarks, t.admin_query, t.query_status,
                    tc.hours, tc.collaborator_type
                FROM tasks t
                JOIN task_collaborators tc ON t.id = tc.task_id
                WHERE tc.user_id = ?
            `;

            const params = [userId];

            if (date) {
                query += ' AND t.date = ?';
                params.push(date);
            }

            query += ' ORDER BY t.created_at DESC';

            const result = await executeQuery(query, params);
            return res.status(200).json({ success: true, tasks: result.rows });

        } else if (action === 'add') {
            const { userId, taskType, customTaskName, hours, date, startTime, endTime, remarks, collaborators } = data;

            // 1. Insert into tasks (Main record)
            const insertTaskResult = await executeQuery(
                'INSERT INTO tasks (user_id, task_type, custom_task_name, hours, date, start_time, end_time, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
                [userId, taskType, customTaskName || null, hours, date, startTime || null, endTime || null, remarks || null]
            );

            const taskId = insertTaskResult.rows[0].id;

            // 2. Insert into task_collaborators
            const collaboratorStatements = [];

            // Add self (Creator/Primary)
            collaboratorStatements.push({
                sql: 'INSERT INTO task_collaborators (task_id, user_id, hours, collaborator_type) VALUES (?, ?, ?, ?)',
                args: [taskId, userId, hours, 'primary']
            });

            // Add other collaborators
            if (collaborators && Array.isArray(collaborators)) {
                for (const collab of collaborators) {
                    // collab object: { userId, hours, type }
                    collaboratorStatements.push({
                        sql: 'INSERT INTO task_collaborators (task_id, user_id, hours, collaborator_type) VALUES (?, ?, ?, ?)',
                        args: [taskId, collab.userId, collab.hours, 'secondary']
                    });
                }
            }

            await executeBatch(collaboratorStatements);

            if (insertTaskResult.rowsAffected > 0) {
                await logAction(userId, 'ADD_TASK', {
                    task_type: taskType,
                    hours,
                    date,
                    remarks,
                    collaborators_count: collaborators ? collaborators.length : 0
                }, req);
            }
            return res.status(200).json({ success: true });

        } else if (action === 'update') {
            const { taskId, userId, taskType, customTaskName, hours, date, startTime, endTime, remarks } = data;

            // Verify ownership
            const checkResult = await executeQuery('SELECT user_id FROM tasks WHERE id = ?', [taskId]);
            if (checkResult.rows.length === 0 || checkResult.rows[0].user_id !== userId) {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }

            await executeQuery(
                'UPDATE tasks SET task_type = ?, custom_task_name = ?, hours = ?, date = ?, start_time = ?, end_time = ?, remarks = ? WHERE id = ?',
                [taskType, customTaskName || null, hours, date, startTime || null, endTime || null, remarks || null, taskId]
            );

            // Also update the primary collaborator entry in task_collaborators
            await executeQuery(
                "UPDATE task_collaborators SET hours = ? WHERE task_id = ? AND user_id = ? AND collaborator_type = 'primary'",
                [hours, taskId, userId]
            );

            await logAction(userId, 'UPDATE_TASK', {
                taskId,
                task_type: taskType,
                hours,
                date,
                remarks
            }, req);

            return res.status(200).json({ success: true });

        } else if (action === 'delete') {
            const { taskId, userId } = data;

            // Verify ownership
            const checkResult = await executeQuery('SELECT user_id FROM tasks WHERE id = ?', [taskId]);
            if (checkResult.rows.length === 0 || checkResult.rows[0].user_id !== userId) {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }

            await executeQuery('DELETE FROM tasks WHERE id = ?', [taskId]);
            // Cascade delete will handle task_collaborators

            await logAction(userId, 'DELETE_TASK', { taskId }, req);
            return res.status(200).json({ success: true });

        } else if (action === 'get-today-hours') {
            const { userId, date } = data;
            // Updated to sum from task_collaborators
            const result = await executeQuery(
                'SELECT SUM(hours) as total FROM task_collaborators WHERE user_id = ? AND task_id IN (SELECT id FROM tasks WHERE date = ?)',
                [userId, date]
            );
            const total = result.rows[0]?.total || 0;
            return res.status(200).json({ success: true, hours: total });

        } else if (action === 'raise-query') {
            const { taskId, query, adminId } = data;

            await executeQuery(
                "UPDATE tasks SET admin_query = ?, query_status = 'pending' WHERE id = ?",
                [query, taskId]
            );

            return res.status(200).json({ success: true });

        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Tasks API error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
