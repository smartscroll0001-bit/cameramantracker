import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { KPIBadge } from '../components/KPIBadge';
import { useAuth } from '../context/AuthContext';
import { getTeamPerformance, getExportData, sendAdminQuery } from '../lib/api';
import { exportData } from '../lib/exportUtils.js';

import { Users, TrendingUp, Clock, Download, X, Calendar, FileSpreadsheet, FileText, RefreshCw, MessageSquare, Send } from 'lucide-react';
import './AdminDashboard.css';

export function AdminDashboard() {
    const { user } = useAuth();
    const [performance, setPerformance] = useState({
        underperforming: 0,
        normal: 0,
        overperforming: 0,
        onLeave: 0,
        holiday: 0,
    });
    const [trainers, setTrainers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const localDate = new Date(today.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    });

    // Export Modal State
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        startDate: '',
        endDate: '',
        format: 'xlsx'
    });

    useEffect(() => {
        // Initialize export dates
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const localDate = new Date(today.getTime() - (offset * 60 * 1000));
        const todayStr = localDate.toISOString().split('T')[0];

        // Default start date to 1st of current month
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const localFirstDay = new Date(firstDay.getTime() - (offset * 60 * 1000));
        const firstDayStr = localFirstDay.toISOString().split('T')[0];

        setExportConfig(prev => ({ ...prev, startDate: firstDayStr, endDate: todayStr }));
    }, []);

    const loadData = async (date, isBackground = false) => {
        if (!isBackground) setLoading(true);

        const perfResult = await getTeamPerformance(date);

        if (perfResult.success) {
            setPerformance(perfResult.performance);
            setTrainers(perfResult.trainers);
        }

        setLoading(false);
    };

    // Query Modal State
    const [showQueryModal, setShowQueryModal] = useState(false);
    const [selectedTrainer, setSelectedTrainer] = useState(null);
    const [queryText, setQueryText] = useState('');
    const [sendingQuery, setSendingQuery] = useState(false);

    const openQueryModal = (trainer) => {
        setSelectedTrainer(trainer);
        setQueryText('');
        setShowQueryModal(true);
    };

    const handleSendQuery = async (e) => {
        e.preventDefault();
        if (!selectedTrainer) return;

        setSendingQuery(true);
        const result = await sendAdminQuery(selectedTrainer.owner_id || selectedTrainer.id, queryText, user.id);

        if (result.success) {
            alert('Message sent successfully');
            setShowQueryModal(false);
            setQueryText('');
        } else {
            alert('Failed to send message: ' + (result.error || 'Unknown error'));
        }
        setSendingQuery(false);
    };

    useEffect(() => {
        loadData(selectedDate);
    }, [selectedDate]);

    const totalTrainers = trainers.length;
    const avgHours = trainers.length > 0
        ? (trainers.reduce((sum, t) => sum + t.hours, 0) / trainers.length).toFixed(1)
        : 0;

    const handleExportSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); // Using main loading state for simplicity

        const result = await getExportData(exportConfig.startDate, exportConfig.endDate);

        if (result.success) {
            exportData(result.data, `team_performance_${exportConfig.startDate}_to_${exportConfig.endDate}`, exportConfig.format);
            setExportModalOpen(false);
        } else {
            alert('Failed to export data');
        }
        setLoading(false);
    };

    return (
        <div className="dashboard-layout">
            <Sidebar />

            <main className="main-content">
                <div className="page-header-container">
                    <div className="page-title-section">
                        <h1 className="page-title">Team Overview</h1>
                        <p className="page-subtitle">Performance metrics for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>

                    <div className="page-actions">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => loadData(selectedDate)}
                            title="Refresh Data"
                        >
                            <RefreshCw size={16} />
                        </button>

                        <div className="date-picker-container">
                            <label className="form-label mobile-hidden" style={{ marginBottom: '0.25rem', fontSize: '0.75rem' }}>Select Date</label>
                            <div className="date-input-wrapper">
                                <Clock size={16} className="date-icon" />
                                <input
                                    type="date"
                                    className="form-input date-input"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <button className="btn btn-secondary btn-sm" onClick={() => setExportModalOpen(true)}>
                            <Download size={16} />
                            Export
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">Loading...</div>
                ) : (
                    <>
                        {/* Metrics Cards */}
                        <div className="metrics-grid">
                            <div className="metric-card card">
                                <div className="metric-icon" style={{ background: 'rgba(163, 230, 53, 0.2)' }}>
                                    <Users size={24} style={{ color: 'var(--accent-green)' }} />
                                </div>
                                <div className="metric-content">
                                    <div className="metric-value">{totalTrainers}</div>
                                    <div className="metric-label">Total Cameramen</div>
                                </div>
                            </div>

                            <div className="metric-card card">
                                <div className="metric-icon" style={{ background: 'rgba(59, 130, 246, 0.2)' }}>
                                    <Clock size={24} style={{ color: '#3b82f6' }} />
                                </div>
                                <div className="metric-content">
                                    <div className="metric-value">{avgHours}</div>
                                    <div className="metric-label">Average Hours</div>
                                </div>
                            </div>

                            <div className="metric-card card">
                                <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.2)' }}>
                                    <TrendingUp size={24} style={{ color: 'var(--status-green)' }} />
                                </div>
                                <div className="metric-content">
                                    <div className="metric-value">{performance.overperforming}</div>
                                    <div className="metric-label">Overperforming</div>
                                </div>
                            </div>
                        </div>

                        {/* Performance Distribution & Stats */}
                        <div className="performance-section" style={{ gridTemplateColumns: '1fr' }}>
                            <div className="card detailed-stats">
                                <h3 className="card-title">Team Status</h3>
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>JS ID</th>
                                                <th>Status</th>
                                                <th>Hours</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {trainers.map(trainer => (
                                                <tr key={trainer.id}>
                                                    <td>{trainer.name}</td>
                                                    <td>{trainer.js_id}</td>
                                                    <td>
                                                        <span className={`status-badge status-${trainer.status.toLowerCase().replace(' ', '-')}`}>
                                                            {trainer.status}
                                                        </span>
                                                    </td>
                                                    <td className="font-mono">{trainer.hours.toFixed(1)}h</td>
                                                    <td>
                                                        <button
                                                            className="btn-icon"
                                                            title="Message"
                                                            onClick={() => openQueryModal(trainer)}
                                                        >
                                                            <MessageSquare size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Query Modal */}
                {showQueryModal && (
                    <div className="modal-overlay">
                        <div className="modal-content card fade-in" style={{ maxWidth: '500px' }}>
                            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 className="card-title" style={{ margin: 0 }}>Message {selectedTrainer?.name}</h3>
                                <button className="btn-icon" onClick={() => setShowQueryModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleSendQuery}>
                                <div className="form-group">
                                    <label className="form-label">Message / Query</label>
                                    <textarea
                                        className="form-input"
                                        rows="4"
                                        value={queryText}
                                        onChange={(e) => setQueryText(e.target.value)}
                                        placeholder="Type your message here..."
                                        required
                                    ></textarea>
                                </div>
                                <div className="form-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowQueryModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={sendingQuery}>
                                        {sendingQuery ? 'Sending...' : (
                                            <>
                                                <Send size={16} /> Send Message
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>

            {/* Export Modal */}
            {exportModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Export Data</h2>
                            <button className="close-button" onClick={() => setExportModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleExportSubmit}>
                            <div className="form-group">
                                <label className="form-label">Date Range</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={exportConfig.startDate}
                                            onChange={(e) => setExportConfig({ ...exportConfig, startDate: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={exportConfig.endDate}
                                            onChange={(e) => setExportConfig({ ...exportConfig, endDate: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Format</label>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <label className={`recipient-chip ${exportConfig.format === 'xlsx' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                                        <input
                                            type="radio"
                                            name="format"
                                            value="xlsx"
                                            checked={exportConfig.format === 'xlsx'}
                                            onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })}
                                            style={{ display: 'none' }}
                                        />
                                        <FileSpreadsheet size={16} />
                                        Excel (.xlsx)
                                    </label>
                                    <label className={`recipient-chip ${exportConfig.format === 'csv' ? 'selected' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                                        <input
                                            type="radio"
                                            name="format"
                                            value="csv"
                                            checked={exportConfig.format === 'csv'}
                                            onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })}
                                            style={{ display: 'none' }}
                                        />
                                        <FileText size={16} />
                                        CSV (.csv)
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setExportModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    <Download size={16} />
                                    Export
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
