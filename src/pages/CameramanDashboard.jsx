import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { KPIBadge } from '../components/KPIBadge';
import { ChangePassword } from '../components/ChangePassword';
import { useAuth } from '../context/AuthContext';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { getUserTasks, addTask, updateTask, deleteTask, getTodayHours, getTaskTypes, getAllTrainers, getUserQueries } from '../lib/api';
import { Plus, Clock, Edit2, Trash2, Users, MessageSquare, X } from 'lucide-react';
import './CameramanDashboard.css';

const FALLBACK_TASK_TYPES = [
    'Shift Briefing', 'Refresher Session', 'Call Audit', 'Call Taking',
    'Meeting - Other', 'Team Meeting', 'Half Day', 'Leave', 'Holiday', 'Others'
];

export function CameramanDashboard() {
    const { user, loginUser } = useAuth();
    const [todayHours, setTodayHours] = useState(0);
    const [tasks, setTasks] = useState([]);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskTypes, setTaskTypes] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mustChangePassword, setMustChangePassword] = useState(user?.must_change_password === 1);
    const [editingTask, setEditingTask] = useState(null);
    const [adminQueries, setAdminQueries] = useState([]);

    const [formData, setFormData] = useState({
        taskType: '',
        customTaskName: '',
        remarks: '',
        hours: '',
        date: (() => {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        })(),
        startTime: '',
    });

    const [collaborators, setCollaborators] = useState([]); // [{ userId, hours, isFullHours }]

    // Calculate end time based on start time and hours
    const calculateEndTime = (startTime, hours) => {
        if (!startTime || !hours) return '';

        const [startHour, startMinute] = startTime.split(':').map(Number);
        const totalMinutes = startHour * 60 + startMinute + Math.floor(hours * 60);
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const endMinute = totalMinutes % 60;

        return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    };

    const endTime = calculateEndTime(formData.startTime, formData.hours);

    const leaveTask = tasks.find(t => t.task_type === 'Leave' || t.task_type === 'Holiday');
    const halfDayTask = tasks.find(t => t.task_type === 'Half Day');

    // Calculate status client-side
    let statusOverride = null;
    if (leaveTask) {
        statusOverride = leaveTask.task_type === 'Leave' ? 'On Leave' : 'Holiday';
    } else {
        const minHours = halfDayTask ? 3.5 : 7;
        const maxHours = halfDayTask ? 4.5 : 7.5;

        if (todayHours < minHours) statusOverride = 'underperforming';
        else if (todayHours <= maxHours) statusOverride = 'normal';
        else statusOverride = 'overperforming';
    }

    const loadData = async () => {
        // Get today's date in local timezone (not UTC)
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const [tasksResult, hoursResult, typesResult, usersResult, queriesResult] = await Promise.all([
            getUserTasks(user.id, todayStr),
            getTodayHours(user.id, todayStr),
            getTaskTypes(),
            getAllTrainers(),
            getUserQueries(user.id)
        ]);

        if (typesResult.success && typesResult.types.length > 0) {
            // Ensure system types like Leave and Half Day are always available
            const apiTypes = typesResult.types.map(t => t.name);
            const systemTypes = ['Leave', 'Half Day', 'Holiday'];
            // Combine and deduplicate
            setTaskTypes([...new Set([...apiTypes, ...systemTypes])]);
        } else if (taskTypes.length === 0) {
            setTaskTypes(FALLBACK_TASK_TYPES);
        }

        if (tasksResult.success) {
            setTasks(tasksResult.tasks);
        }
        if (hoursResult.success) {
            setTodayHours(hoursResult.hours);
        }
        if (usersResult.success) {
            // API returns 'trainers' array
            setAllUsers((usersResult.trainers || []).filter(u => u.id !== user.id)); // Exclude self
        }
        if (queriesResult.success) {
            setAdminQueries(queriesResult.queries);
        }
        setLoading(false);
    };

    const handlePasswordChanged = () => {
        // Update user object to reflect password change
        const updatedUser = { ...user, must_change_password: 0 };
        loginUser(updatedUser);
        setMustChangePassword(false);
    };

    useEffect(() => {
        loadData();
        // Poll for updates every 5 seconds
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, [user.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Validation: Cannot add Leave/Holiday if other tasks exist
        const isLeaveOrHoliday = ['Leave', 'Holiday'].includes(formData.taskType);
        // Check if there are any existing tasks (excluding the one properly being edited, if any)
        const otherTasksExist = tasks.some(t => !editingTask || t.id !== editingTask.id);

        if (isLeaveOrHoliday && otherTasksExist) {
            alert("You cannot mark 'Leave' or 'Holiday' if you have already logged tasks for today. Please delete existing tasks first.");
            setLoading(false);
            return;
        }

        // Process collaborators
        // If task type is Leave/Half Day/Holiday, force collaborators to be empty
        const isPersonalTask = ['Leave', 'Half Day', 'Holiday'].includes(formData.taskType);

        const finalCollaborators = isPersonalTask ? [] : collaborators.map(c => ({
            userId: c.userId,
            hours: c.isFullHours ? formData.hours : c.hours
        }));

        const result = editingTask
            ? await updateTask(
                editingTask.id,
                user.id,
                formData.taskType,
                formData.taskType === 'Others' ? formData.customTaskName : null,
                parseFloat(formData.hours),
                formData.date,
                formData.startTime || null,
                endTime || null,
                formData.remarks || null
            )
            : await addTask(
                user.id,
                formData.taskType,
                formData.taskType === 'Others' ? formData.customTaskName : null,
                parseFloat(formData.hours),
                formData.date,
                formData.startTime || null,
                endTime || null,
                formData.remarks || null,
                finalCollaborators
            );

        if (result.success) {
            // Reset form
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            setFormData({
                taskType: '',
                customTaskName: '',
                remarks: '',
                hours: '',
                date: `${year}-${month}-${day}`,
                startTime: '',
            });
            setCollaborators([]);
            setShowTaskForm(false);
            setEditingTask(null);
            // Reload data immediately
            loadData();
        }

        setLoading(false);
    };

    const handleAddCollaborator = () => {
        setCollaborators([...collaborators, { userId: '', hours: '', isFullHours: true }]);
    };

    const handleCollaboratorChange = (index, field, value) => {
        const newCollaborators = [...collaborators];
        newCollaborators[index][field] = value;
        setCollaborators(newCollaborators);
    };

    const handleRemoveCollaborator = (index) => {
        const newCollaborators = collaborators.filter((_, i) => i !== index);
        setCollaborators(newCollaborators);
    };

    const handleEdit = (task) => {
        setEditingTask(task);
        setFormData({
            taskType: task.task_type,
            customTaskName: task.custom_task_name || '',
            remarks: task.remarks || '',
            hours: task.hours.toString(),
            date: task.date,
            startTime: task.start_time || '',
        });
        // Note: Collaborator editing is not fully implemented in this iteration for simplicity,
        // or assumes only main task details are edited.
        setCollaborators([]);
        setShowTaskForm(true);
    };

    const handleDelete = async (taskId) => {
        if (!confirm('Are you sure you want to delete this task?')) return;

        const result = await deleteTask(taskId, user.id);
        if (result.success) {
            loadData();
        } else {
            alert(result.error || 'Failed to delete task');
        }
    };

    const handleCancelEdit = () => {
        setEditingTask(null);
        setShowTaskForm(false);
        setCollaborators([]);

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        setFormData({
            taskType: '',
            customTaskName: '',
            remarks: '',
            hours: '',
            date: `${year}-${month}-${day}`,
            startTime: '',
        });
    };

    return (
        <div className="dashboard-layout">
            {mustChangePassword && <ChangePassword onPasswordChanged={handlePasswordChanged} />}

            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <h1 className="page-title">My Dashboard</h1>
                </div>

                <AnnouncementBanner />

                {/* Admin Queries Notification */}
                {adminQueries.length > 0 && (
                    <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-blue)' }}>
                        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MessageSquare size={20} className="text-blue" />
                            Messages from Admin
                        </h3>
                        {adminQueries.map(q => (
                            <div key={q.id} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}>
                                <p style={{ margin: 0 }}>{q.query_text}</p>
                                <small className="text-muted">{new Date(q.created_at).toLocaleString()}</small>
                            </div>
                        ))}
                    </div>
                )}

                <div className="dashboard-grid">
                    {/* Status Card */}
                    <div className="status-card card">
                        <div className="status-header">
                            <div className="status-label">STATUS</div>
                            <KPIBadge hours={todayHours} status={statusOverride} />
                        </div>
                        <div className="status-hours">
                            <span className="hours-number">{todayHours.toFixed(1)}</span>
                            <span className="hours-unit">hrs</span>
                        </div>
                        <div className="status-footer">Total contribution today</div>
                    </div>

                    {/* Quick Add Task Button */}
                    <div className="quick-actions card">
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowTaskForm(!showTaskForm)}
                            disabled={!!leaveTask}
                            title={leaveTask ? "Delete Leave/Holiday task to add new tasks" : "Log New Task"}
                            style={leaveTask ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                            <Plus size={20} />
                            Log New Task
                        </button>
                        {leaveTask && (
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                You are marked as {leaveTask.task_type}. Delete this task to log other work.
                            </p>
                        )}
                        {halfDayTask && !leaveTask && (
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                You are on Half Day. Target hours adjusted (3.5 - 4.5 hrs).
                            </p>
                        )}
                    </div>
                </div>

                {/* Task Form */}
                {showTaskForm && (
                    <div className="card task-form-card fade-in">
                        <h3 className="card-title">{editingTask ? 'Edit Task' : 'Log Task'}</h3>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Task Type</label>
                                    <select
                                        className="form-select"
                                        value={formData.taskType}
                                        onChange={(e) => {
                                            const type = e.target.value;
                                            const isLeaveOrHoliday = type === 'Leave' || type === 'Holiday' || type === 'Half Day';
                                            setFormData({
                                                ...formData,
                                                taskType: type,
                                                hours: isLeaveOrHoliday ? '0' : formData.hours
                                            });
                                        }}
                                        required
                                    >
                                        <option value="">Select a task type</option>
                                        {taskTypes.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.taskType === 'Others' && (
                                    <div className="form-group">
                                        <label className="form-label">Custom Task Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.customTaskName}
                                            onChange={(e) =>
                                                setFormData({ ...formData, customTaskName: e.target.value })
                                            }
                                            placeholder="Enter task name"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Remarks (Optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.remarks}
                                        onChange={(e) =>
                                            setFormData({ ...formData, remarks: e.target.value })
                                        }
                                        placeholder="Add remarks"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Hours</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="24"
                                        className="form-input"
                                        value={formData.hours}
                                        onChange={(e) =>
                                            setFormData({ ...formData, hours: e.target.value })
                                        }
                                        placeholder="e.g., 2.5"
                                        required={!['Leave', 'Holiday', 'Half Day'].includes(formData.taskType)}
                                        disabled={['Leave', 'Holiday', 'Half Day'].includes(formData.taskType)}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Start Time (Optional)</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={formData.startTime}
                                        onChange={(e) =>
                                            setFormData({ ...formData, startTime: e.target.value })
                                        }
                                    />
                                </div>

                                {/* Collaborators Section - Hidden for Leave/Half Day */}
                                {!editingTask && !['Leave', 'Holiday', 'Half Day'].includes(formData.taskType) && (
                                    <div className="form-group full-width" style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>Add Cameramen (Collaborators)</span>
                                            <button type="button" className="btn btn-sm btn-secondary" onClick={handleAddCollaborator}>
                                                <Plus size={14} /> Add
                                            </button>
                                        </label>

                                        {collaborators.map((collab, index) => (
                                            <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                <select
                                                    className="form-select"
                                                    value={collab.userId}
                                                    onChange={(e) => handleCollaboratorChange(index, 'userId', e.target.value)}
                                                    required
                                                >
                                                    <option value="">Select Cameraman</option>
                                                    {allUsers.map(u => (
                                                        <option key={u.id} value={u.id}>{u.name} ({u.js_id})</option>
                                                    ))}
                                                </select>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={collab.isFullHours}
                                                        onChange={(e) => handleCollaboratorChange(index, 'isFullHours', e.target.checked)}
                                                    /> <span style={{ fontSize: '0.8rem' }}>Full Hours</span>
                                                </div>

                                                {!collab.isFullHours && (
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        placeholder="Hrs"
                                                        value={collab.hours}
                                                        onChange={(e) => handleCollaboratorChange(index, 'hours', e.target.value)}
                                                        style={{ width: '80px' }}
                                                        required
                                                    />
                                                )}

                                                <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveCollaborator(index)}>
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}


                                <div className="form-group">
                                    <label className="form-label">Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.date}
                                        onChange={(e) =>
                                            setFormData({ ...formData, date: e.target.value })
                                        }
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-actions">
                                {editingTask && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={handleCancelEdit}
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                                {!editingTask && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setShowTaskForm(false)}
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Saving...' : editingTask ? 'Update Task' : 'Save Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Activity Log */}
                <div className="card activity-card">
                    <h3 className="card-title">Today's Activity Log</h3>
                    {tasks.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <p>No tasks logged today</p>
                        </div>
                    ) : (
                        <div className="activity-list">
                            {tasks.map((task, index) => (
                                <div key={task.id} className="activity-item">
                                    <div className="activity-number">{index + 1}</div>
                                    <div className="activity-details">
                                        <div className="activity-name">
                                            {task.task_type === 'Others' ? task.custom_task_name : task.task_type}
                                            {task.remarks && <span className="text-muted" style={{ fontWeight: 'normal', marginLeft: '8px' }}>- {task.remarks}</span>}
                                            {task.collaborator_type === 'secondary' && <span className="badge badge-blue" style={{ marginLeft: '0.5rem', fontSize: '0.7em' }}>Collaborator</span>}
                                        </div>
                                        <div className="activity-time">
                                            {task.start_time && task.end_time
                                                ? `${task.start_time} - ${task.end_time}`
                                                : new Date(task.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div className="activity-badge-yellow">
                                        {task.hours}h
                                    </div>
                                    <div className="activity-actions">
                                        <button
                                            className="btn-icon btn-edit"
                                            onClick={() => handleEdit(task)}
                                            title="Edit task"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            className="btn-icon btn-delete"
                                            onClick={() => handleDelete(task.id)}
                                            title="Delete task"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
