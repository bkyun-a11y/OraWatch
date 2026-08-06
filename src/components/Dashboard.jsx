'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Database, Activity, Server, Lock, AlertTriangle,
    RefreshCw, Settings, Search, Clock, ShieldCheck,
    Terminal, BarChart2, Cpu, HardDrive, Sun, Moon,
    FileText, X
} from 'lucide-react';

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('sessions'); // sessions, locks, settings
    const [data, setData] = useState({ sessions: [], locks: [], tablespaces: [], metrics: { cpu: 0, memory: 0, io: 0, connections: 0 } });
    const [config, setConfig] = useState({
        host: '127.0.0.1', port: '1521', sid: 'XE', user: 'system', password: '', mockMode: true
    });
    const [loading, setLoading] = useState(false);
    const [dbError, setDbError] = useState(null); // DB 연결 오류 메시지
    const [tick, setTick] = useState(0);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [darkMode, setDarkMode] = useState(true);

    const [menuPos, setMenuPos] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedSession, setSelectedSession] = useState(null);
    const [reportHtml, setReportHtml] = useState(null);
    const [isReportOpen, setIsReportOpen] = useState(false);

    const handleNodeContextMenu = (e, node) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
        setSelectedNode(node);
        setSelectedSession(null);
    };

    const handleSessionContextMenu = (e, session) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
        setSelectedSession(session);
        setSelectedNode(null);
    };

    const fetchSqlMonitorReport = async (sqlId) => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/sessions/sql-monitor?sql_id=${sqlId}`);
            setReportHtml(res.data);
            setIsReportOpen(true);
        } catch (e) {
            alert('Failed to fetch report: ' + (e.response?.data?.error || e.message));
        } finally {
            setLoading(false);
            setMenuPos(null);
        }
    };

    const buildLockTree = (locks) => {
        if (!locks || locks.length === 0) return [];
        const nodes = {};
        const roots = [];

        locks.forEach(l => {
            if (!nodes[l.WAITING_SID]) {
                nodes[l.WAITING_SID] = {
                    sid: l.WAITING_SID,
                    serial: l.WAITING_SERIAL,
                    user: l.WAITING_USER,
                    et: l.WAITING_ET,
                    sql: l.WAITING_SQL,
                    object: l.OBJECT_NAME,
                    type: l.LOCK_TYPE,
                    mode: l.MODE_REQUESTED,
                    children: []
                };
            } else {
                nodes[l.WAITING_SID] = {
                    ...nodes[l.WAITING_SID],
                    serial: l.WAITING_SERIAL,
                    user: l.WAITING_USER,
                    et: l.WAITING_ET,
                    sql: l.WAITING_SQL,
                    object: l.OBJECT_NAME,
                    type: l.LOCK_TYPE,
                    mode: l.MODE_REQUESTED,
                };
            }

            if (!nodes[l.BLOCKING_SID]) {
                nodes[l.BLOCKING_SID] = {
                    sid: l.BLOCKING_SID,
                    serial: l.BLOCKING_SERIAL,
                    user: l.BLOCKING_USER,
                    et: l.BLOCKING_ET,
                    sql: l.BLOCKING_SQL,
                    program: l.BLOCKING_PROGRAM,
                    children: []
                };
            }

            nodes[l.BLOCKING_SID].children.push(nodes[l.WAITING_SID]);
            nodes[l.WAITING_SID].isWaiting = true;
        });

        Object.values(nodes).forEach(node => {
            if (!node.isWaiting) roots.push(node);
        });

        return roots;
    };

    const killSession = async (sid, serial, type) => {
        if (!window.confirm(`Are you sure you want to kill the ${type} session (SID: ${sid})?`)) return;
        try {
            const res = await axios.post('/api/sessions/kill', { sid, serial });
            if (res.data.success) {
                alert(`Successfully killed ${type} session ${sid}`);
                // Trigger a refresh
                setTick(t => t + 1);
            }
        } catch (e) {
            alert('Kill Failed: ' + (e.response?.data?.error || e.message));
        } finally {
            setMenuPos(null);
        }
    };

    // Theme Toggle Effect
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // Load Initial Config
    useEffect(() => {
        axios.get('/api/config')
            .then(res => {
                if (res.data) setConfig(prev => ({ ...prev, ...res.data }));
            })
            .catch(err => console.error("Failed to load config:", err));
    }, []);

    // Poll Data
    useEffect(() => {
        if (!config.host && !config.mockMode) return;
        const fetchData = async () => {
            setLoading(true);
            setDbError(null);
            try {
                const [sRes, lRes, tRes, mRes] = await Promise.all([
                    axios.get('/api/sessions'),
                    axios.get('/api/locks'),
                    axios.get('/api/tablespaces'),
                    axios.get('/api/metrics')
                ]);

                // LIVE 모드에서 에러 응답 체크
                if (sRes.data?.error) throw new Error(sRes.data.error);
                if (mRes.data?.error) throw new Error(mRes.data.error);

                setData({
                    sessions: Array.isArray(sRes.data) ? sRes.data : [],
                    locks: Array.isArray(lRes.data) ? lRes.data : [],
                    tablespaces: Array.isArray(tRes.data) ? tRes.data : [],
                    metrics: mRes.data || { cpu: 0, memory: 0, io: 0, connections: 0 }
                });
                setLastUpdated(new Date());
            } catch (e) {
                const errMsg = e.response?.data?.error || e.message;
                console.error('Poll Error:', errMsg);
                if (!config.mockMode) setDbError(errMsg);
            } finally {
                setTimeout(() => setLoading(false), 500);
            }
        };
        fetchData();
        const interval = setInterval(() => { setTick(t => t + 1); fetchData(); }, 5000);
        return () => clearInterval(interval);
    }, [config.mockMode, tick]);

    // Clear context states when tab changes to prevent "ghosting"
    useEffect(() => {
        setMenuPos(null);
        setSelectedNode(null);
        setSelectedSession(null);
    }, [activeTab]);

    // Compute Metrics
    const activeCount = data.sessions.filter(s => s.STATUS === 'ACTIVE').length;
    const lockCount = data.locks.length;
    const waitEvents = data.sessions.filter(s => s.STATE === 'WAITING').length;

    // Close menu on click elsewhere
    useEffect(() => {
        const hideMenu = () => setMenuPos(null);
        window.addEventListener('click', hideMenu);
        return () => window.removeEventListener('click', hideMenu);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-zinc-50 dark:bg-[#2c2c2c] text-zinc-800 dark:text-zinc-300 font-sans selection:bg-orange-500/20 selection:text-orange-600 dark:selection:text-orange-100 overflow-hidden transition-colors duration-300">
            {/* DB 연결 오류 배너 */}
            {dbError && (
                <div className="flex items-center gap-3 px-4 py-2 bg-red-600 text-white text-xs font-bold z-50 shrink-0">
                    <span>⚠️ DB 연결 오류:</span>
                    <span className="font-normal truncate flex-1">{dbError}</span>
                    <button onClick={() => setDbError(null)} className="ml-auto text-white/70 hover:text-white shrink-0">✕</button>
                </div>
            )}
            {/* Context Menu Overlay */}
            {menuPos && (selectedNode || selectedSession) && (
                <div
                    className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl py-1 min-w-[180px]"
                    style={{ top: menuPos.y, left: menuPos.x }}
                >
                    {selectedNode && (
                        <button
                            onClick={() => killSession(selectedNode.sid, selectedNode.serial, 'SESSION')}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                        >
                            <ShieldCheck className="w-3 h-3" /> Kill Session (#{selectedNode.sid})
                        </button>
                    )}

                    {selectedSession && (
                        <>
                            {selectedSession.SQL_ID && (
                                <button
                                    onClick={() => fetchSqlMonitorReport(selectedSession.SQL_ID)}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                                >
                                    <FileText className="w-3 h-3" /> SQL Monitoring Report
                                </button>
                            )}
                            <button
                                onClick={() => killSession(selectedSession.SID, selectedSession.SERIAL, 'SESSION')}
                                className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                            >
                                <ShieldCheck className="w-3 h-3" /> Kill Session (#{selectedSession.SID})
                            </button>
                        </>
                    )}

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                    <button
                        onClick={() => setMenuPos(null)}
                        className="w-full text-left px-4 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* SQL Monitor Report Modal */}
            {isReportOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-zinc-800 w-full max-w-[70%] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800">
                        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 bg-zinc-50 dark:bg-zinc-900/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-600 rounded-lg">
                                    <FileText className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-tight">SQL Monitoring Report</h3>
                                    <p className="text-[10px] text-zinc-500 font-medium tracking-tighter uppercase">ID: {selectedSession?.SQL_ID}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsReportOpen(false)}
                                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-zinc-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-white">
                            <iframe
                                srcDoc={reportHtml}
                                className="w-full h-full border-none"
                                title="SQL Monitor Report"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Header Bar */}
            <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-orange-600 rounded-lg shadow-sm">
                        <Database className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-3">
                            Oracle Watch
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter border ${
                                process.env.NODE_ENV === 'development' 
                                ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-200 dark:border-amber-500/30' 
                                : 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-200 dark:border-blue-500/30'
                            }`}>
                                {process.env.NODE_ENV === 'development' ? 'DEV Mode' : 'PRD Mode'}
                            </span>
                        </h1>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">Database Performance Real-time Monitoring</p>
                    </div>
                    <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-800 mx-2" />
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                        <Server className="w-3 h-3" />
                        <span>{config.host}</span>
                        <span className="text-zinc-400 dark:text-zinc-600">/</span>
                        <span>{config.sid}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {loading && <RefreshCw className="w-3 h-3 text-orange-500 animate-spin" />}

                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
                    >
                        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>

                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${config.mockMode ? 'border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-600 bg-orange-50 dark:bg-orange-950/20' : 'border-green-200 dark:border-green-900 text-green-600 bg-green-50 dark:bg-green-950/20'}`}>
                        {config.mockMode ? 'SIMULATION' : 'LIVE CONNECTED'}
                    </div>
                    <nav className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <TabBtn active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} label="Sessions" icon={<Activity className="w-3 h-3" />} />
                        <TabBtn active={activeTab === 'locks'} onClick={() => setActiveTab('locks')} label="Locks" icon={<Lock className="w-3 h-3" />} count={lockCount} />
                        <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Configuration" icon={<Settings className="w-3 h-3" />} />
                    </nav>
                </div>
            </header>

            {/* 2. Main Content Grid */}
            <main className="flex-1 p-4 flex flex-col gap-4 min-h-0">

                {/* Main Content Area */}
                <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">

                    {/* Side Info: KPI + Instance Health + Tablespace Usage */}
                    <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0">
                        {/* KPI Tile */}
                        <KpiTile title="Total Connections" value={data.metrics.connections} sub="Database Sessions" color="text-emerald-600 dark:text-emerald-500" icon={<Database className="w-4 h-4" />} />

                        <div className="flex-1 bg-white dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col gap-6 shadow-sm dark:shadow-none overflow-y-auto">
                            {/* Instance Health */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-orange-500" /> Instance Health
                                </h3>
                                <div className="space-y-4 p-2">
                                    <ProgressBar label="CPU Load" value={data.metrics.cpu} color="bg-blue-500" />
                                    <ProgressBar label="Memory Usage" value={data.metrics.memory} color="bg-purple-500" />
                                    <ProgressBar
                                        label="I/O Throughput"
                                        value={Math.min((data.metrics.io / 500) * 100, 100)}
                                        displayValue={`${data.metrics.io} MB/s`}
                                        color="bg-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800" />

                            {/* Tablespace Usage */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-indigo-500" /> Tablespace Usage
                                </h3>
                                <div className="space-y-4 p-2">
                                    {data.tablespaces.length > 0 ? data.tablespaces.map((ts, i) => (
                                        <ProgressBar
                                            key={i}
                                            label={ts.TABLESPACE_NAME}
                                            value={ts.USED_PCT}
                                            limit={100}
                                            color={ts.USED_PCT > 90 ? 'bg-red-500' : ts.USED_PCT > 70 ? 'bg-orange-500' : 'bg-indigo-500'}
                                        />
                                    )) : (
                                        <div className="text-xs text-zinc-500 text-center py-2">Loading tablespace data...</div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 dark:text-zinc-600 font-mono text-center">
                                Last Poll: {lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--:--'}
                            </div>
                        </div>
                    </div>

                    {/* Main View Area */}
                    <div className="col-span-12 lg:col-span-9 flex flex-col bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden relative shadow-sm dark:shadow-none">

                        {activeTab === 'sessions' && (
                            <div key="sessions-tab" className="flex flex-col h-full">
                                <div className="h-10 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-zinc-50 dark:bg-zinc-900/80">
                                    <h2 className="text-xs font-bold text-zinc-700 dark:text-white uppercase flex items-center gap-2">
                                        <Terminal className="w-3 h-3 text-zinc-400 dark:text-zinc-500" /> Active Session List
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <Search className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
                                        <input type="text" placeholder="Filter SID or User..." className="bg-transparent border-none text-xs text-zinc-800 dark:text-white focus:outline-none w-48 placeholder:text-zinc-400 dark:placeholder:text-zinc-700" />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto bg-white dark:bg-transparent">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950 z-10 text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-600 border-b border-zinc-200 dark:border-zinc-800">
                                            <tr>
                                                <th className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">SID</th>
                                                <th className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">User / Machine</th>
                                                <th className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">Program</th>
                                                <th className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 text-right">Last Call (ET)</th>
                                                <th className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">Current SQL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-medium divide-y divide-zinc-100 dark:divide-zinc-800/50">
                                            {data.sessions.map((s, i) => (
                                                <tr
                                                    key={i}
                                                    onContextMenu={(e) => handleSessionContextMenu(e, s)}
                                                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors group cursor-context-menu ${selectedSession?.SID === s.SID && menuPos ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                                                >
                                                    <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">#{s.SID}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-zinc-800 dark:text-zinc-200">{s.USERNAME}</div>
                                                        <div className="text-[10px] text-zinc-500 dark:text-zinc-600 font-normal">{s.MACHINE}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{s.PROGRAM}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className={`font-mono ${s.LAST_CALL_ET > 60 ? 'text-orange-500 dark:text-orange-400 font-bold' : 'text-zinc-500'}`}>
                                                            {s.LAST_CALL_ET}s
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-zinc-500 font-mono text-[11px] max-w-md truncate group-hover:text-zinc-800 dark:group-hover:text-zinc-300">
                                                        {s.SQL_TEXT || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {data.sessions.length === 0 && (
                                                <tr><td colSpan="5" className="p-8 text-center text-zinc-400 dark:text-zinc-600">No active sessions found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'locks' && (
                            <div key="locks-tab" className="flex flex-col h-full">
                                <div className="h-10 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 bg-zinc-50 dark:bg-zinc-900/80">
                                    <h2 className="text-xs font-bold text-zinc-800 dark:text-white uppercase flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3 text-red-500" /> Hierarchical Blocking Tree
                                    </h2>
                                    <span className="ml-4 text-[10px] text-zinc-400 font-medium italic underline decoration-dotted">Right-click on any session to manage</span>
                                </div>
                                <div className="p-8 overflow-auto flex-1">
                                    {data.locks.length > 0 ? (
                                        <div className="max-w-4xl mx-auto space-y-4">
                                            {buildLockTree(data.locks).map((root, i) => (
                                                <LockNode
                                                    key={i}
                                                    node={root}
                                                    onContextMenu={handleNodeContextMenu}
                                                    selectedSid={menuPos ? selectedNode?.sid : null}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 opacity-50 py-20">
                                            <ShieldCheck className="w-16 h-16 mb-4 text-emerald-600 dark:text-emerald-900" />
                                            <p className="text-sm font-bold uppercase">System Healthy</p>
                                            <p className="text-xs">No blocking chains detected</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div key="settings-tab" className="flex flex-col items-center justify-center h-full gap-6 p-8">
                                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-xl dark:shadow-2xl">
                                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
                                        <div className="p-3 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                                            <Settings className="w-6 h-6 text-zinc-800 dark:text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Configuration</h3>
                                            <p className="text-xs text-zinc-500">Instance connection parameters</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <InputGroup label="Host" value={config.host} onChange={e => setConfig({ ...config, host: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="Port" value={config.port} onChange={e => setConfig({ ...config, port: e.target.value })} />
                                            <InputGroup label="SID" value={config.sid} onChange={e => setConfig({ ...config, sid: e.target.value })} />
                                        </div>
                                        <InputGroup label="Username" value={config.user} onChange={e => setConfig({ ...config, user: e.target.value })} />
                                        <InputGroup label="Password" type="password" value={config.password || ''} onChange={e => setConfig({ ...config, password: e.target.value })} />
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await axios.post('/api/test-connection', config);
                                                    alert(res.data.success ? 'Connection Successful! 🟢' : 'Connection Failed 🔴');
                                                } catch (e) {
                                                    alert('Connection Failed: ' + (e.response?.data?.error || e.message));
                                                }
                                            }}
                                            className="flex-1 py-3 text-sm font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white border border-zinc-300 dark:border-zinc-700 rounded-lg transition-colors"
                                        >
                                            Test Connection
                                        </button>
                                        <button
                                            onClick={() => {
                                                const newMode = !config.mockMode;
                                                setConfig({ ...config, mockMode: newMode });
                                                axios.post('/api/config', { ...config, mockMode: newMode }).catch(console.error);
                                            }}
                                            className="flex-1 py-3 text-sm font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white border border-zinc-300 dark:border-zinc-700 rounded-lg transition-colors"
                                        >
                                            {config.mockMode ? 'Switch to LIVE' : 'Switch to SIMULATION'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                const liveConfig = { ...config, mockMode: false };
                                                setConfig(liveConfig);
                                                axios.post('/api/config', liveConfig)
                                                    .then(() => alert('Configuration Saved & Connected! 🚀\nLIVE 모드로 전환되었습니다.'))
                                                    .catch(err => alert('Save Failed: ' + err.message));
                                            }}
                                            className="flex-1 py-3 text-sm font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-500 transition-colors shadow-lg shadow-orange-500/20"
                                        >
                                            Save & Connect
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </main>
        </div>
    );
}

// Sub-components for cleaner code
const TabBtn = ({ active, onClick, icon, label, count }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 ${active
            ? 'bg-zinc-800 border-orange-600 text-white shadow-lg'
            : 'bg-zinc-900 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
    >
        {icon} {label}
        {count > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-black">{count}</span>}
    </button>
);

const KpiTile = ({ title, value, sub, color, icon, alert }) => (
    <div className={`p-5 rounded-xl border flex flex-col justify-between h-28 relative overflow-hidden transition-all duration-300 ${alert
        ? 'bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900/50'
        : 'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none'
        }`}>
        {alert && <div className="absolute inset-0 bg-red-500/5 animate-pulse" />}
        <div className="flex justify-between items-start z-10">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{title}</span>
            <div className={`opacity-80 ${color}`}>{icon}</div>
        </div>
        <div className="z-10">
            <div className={`text-2xl font-bold tracking-tight text-zinc-900 dark:text-white`}>{value}</div>
            <div className={`text-[10px] mt-1 font-medium ${alert ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-600'}`}>{sub}</div>
        </div>
    </div>
);

const ProgressBar = ({ label, value, color, displayValue }) => (
    <div className="group">
        <div className="flex justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-1.5">
            <span>{label}</span>
            <span className="text-zinc-900 dark:text-white">{displayValue || `${Math.round(value)}%`}</span>
        </div>
        <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700">
            <div
                className={`h-full ${color} transition-all duration-500 ease-out rounded-full`}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    </div>
);
const LockNode = ({ node, level = 0, onContextMenu, selectedSid }) => {
    const isSelected = selectedSid === node.sid;
    return (
        <div className="flex flex-col">
            <div
                onContextMenu={(e) => onContextMenu(e, node)}
                style={{ marginLeft: `${level * 2}rem` }}
                className={`mb-2 p-4 border rounded-xl transition-all cursor-context-menu relative group
                    ${isSelected ? 'ring-2 ring-orange-500 shadow-lg' : 'hover:ring-2 hover:ring-orange-500/20'}
                    ${level === 0
                        ? 'bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900/40 shadow-sm'
                        : 'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'}
                `}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${level === 0 ? 'bg-red-500' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                            {level === 0 ? <ShieldCheck className="w-4 h-4 text-white" /> : <Lock className="w-4 h-4 text-orange-500" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-zinc-900 dark:text-white">SID {node.sid}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-black/50 text-zinc-500 font-mono">#{node.serial}</span>
                                {level === 0 && (
                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-500 bg-red-100 dark:bg-red-500/10 px-1.5 rounded-full uppercase tracking-tighter">
                                        Root Holder
                                    </span>
                                )}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-medium flex items-center gap-2">
                                <span className="text-zinc-800 dark:text-zinc-300 font-bold">{node.user}</span>
                                <span className="text-zinc-400">•</span>
                                <span>{node.program || 'Unknown Machine'}</span>
                                {node.et !== undefined && (
                                    <>
                                        <span className="text-zinc-400">•</span>
                                        <span className={`flex items-center gap-0.5 ${node.et > 60 ? 'text-orange-500 font-bold' : 'text-zinc-500'}`}>
                                            <Clock className="w-3 h-3" /> {node.et}s
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {node.object && (
                        <div className="text-right">
                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase block tracking-widest">Locked Object</span>
                            <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400">{node.object}</span>
                        </div>
                    )}
                </div>

                {node.sql && (
                    <div className="mt-3 p-2.5 bg-zinc-50 dark:bg-black/60 rounded-lg border border-zinc-100 dark:border-zinc-800/50 font-mono text-[10px] text-zinc-600 dark:text-zinc-400 break-all leading-relaxed relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500/30"></div>
                        {node.sql}
                    </div>
                )}

                {node.type && (
                    <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-zinc-400" />
                            <span className="text-[10px] font-bold text-zinc-500 uppercase">{node.type}</span>
                        </div>
                        <div className="h-3 w-px bg-zinc-200 dark:bg-zinc-800"></div>
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-orange-500" />
                            <span className="text-[10px] font-black text-orange-600 uppercase tracking-tight">Wait Mode: {node.mode}</span>
                        </div>
                    </div>
                )}
            </div>

            {node.children && node.children.length > 0 && (
                <div className="relative">
                    <div className="absolute left-0 top-0 bottom-4 w-px bg-zinc-200 dark:bg-zinc-800" style={{ marginLeft: `${(level * 2) + 1}rem` }} />
                    {node.children.map((child, i) => (
                        <LockNode key={i} node={child} level={level + 1} onContextMenu={onContextMenu} selectedSid={selectedSid} />
                    ))}
                </div>
            )}
        </div>
    );
};

const InputGroup = ({ label, value, onChange, type = "text" }) => (
    <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">{label}</label>
        <input type={type} value={value} onChange={onChange} className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-orange-500 outline-none transition-colors" />
    </div>
);
