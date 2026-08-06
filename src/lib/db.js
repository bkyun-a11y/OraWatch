import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';

// Global Oracle configuration
if (typeof oracledb !== 'undefined') {
    oracledb.fetchAsString = [oracledb.CLOB];
}

const CONFIG_PATH = path.join(process.cwd(), 'db-config.json');

export function getConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

export function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let pool;

export async function getPool() {
    const config = getConfig();
    if (!config || config.mockMode) return null;

    try {
        if (!pool) {
            const connectString = `${config.host}:${config.port}/${config.sid}`;
            pool = await oracledb.createPool({
                user: config.user,
                password: config.password,
                connectString: connectString,
                poolMax: 5,
                poolMin: 1
            });
        }
        return pool;
    } catch (err) {
        console.error('Oracle Pool Error:', err);
        return null;
    }
}

export async function execute(sql, binds = [], opts = {}) {
    const config = getConfig();
    if (!config || config.mockMode === true) {
        return mockData(sql);
    }

    const pool = await getPool();
    if (!pool) return mockData(sql);

    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.execute(sql, binds, { ...opts, outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    } catch (err) {
        console.error('Execute Error:', err);
        return mockData(sql);
    } finally {
        if (conn) await conn.close();
    }
}

// Persistent mock state for simulation mode
let killedSessions = new Set();

function mockData(sql) {
    const uppercaseSql = sql.toUpperCase();

    // Handle Kill Session in Simulation (including AWS RDS procedure)
    if (uppercaseSql.includes('KILL SESSION') || uppercaseSql.includes('RDSADMIN_UTIL.KILL')) {
        let sid = null;

        // Try matching standard ALTER SYSTEM syntax
        const standardMatch = sql.match(/'(\d+),(\d+)'/);
        if (standardMatch) {
            sid = standardMatch[1];
        }
        // Try matching RDS procedure syntax (named parameters or binds)
        else if (sql.includes(':sid')) {
            // If using binds, we'll need to handle it differently, 
            // but for simplicity in mock, we'll try to find SID from context if possible
            // In our route.js we pass {sid, serial}
        }

        if (sid) killedSessions.add(sid);

        // If we can't find SID from string match (due to binds), 
        // in simulation mode we'll just return success.
        return { success: true };
    }

    // 1. Lock Check (Must come before Session check because lock query joins v$session)
    if (uppercaseSql.includes('V$LOCK') || uppercaseSql.includes('WAITING_SID') || (uppercaseSql.includes('LOCK') && uppercaseSql.includes('WAIT'))) {
        const allLocks = [
            {
                WAITING_SID: 205,
                WAITING_SERIAL: 1120,
                WAITING_USER: 'HR',
                WAITING_ET: 45,
                WAITING_SQL: 'UPDATE EMPLOYEES SET SALARY = SALARY * 1.1 WHERE DEPT_ID = 10',
                LOCK_TYPE: 'TM',
                MODE_REQUESTED: 'Shared',
                BLOCKING_SID: 101,
                BLOCKING_SERIAL: 5422,
                BLOCKING_USER: 'SYS',
                BLOCKING_ET: 120,
                BLOCKING_PROGRAM: 'sqlplus.exe',
                BLOCKING_SQL: 'SELECT /*+ FULL(a) */ COUNT(*) FROM HUGE_TABLE a',
                OBJECT_NAME: 'EMPLOYEES'
            },
            {
                WAITING_SID: 441,
                WAITING_SERIAL: 771,
                WAITING_USER: 'FINANCE',
                WAITING_ET: 15,
                WAITING_SQL: 'DELETE FROM PAYROLL WHERE PERIOD = "2023-12"',
                LOCK_TYPE: 'TX',
                MODE_REQUESTED: 'Exclusive',
                BLOCKING_SID: 101,
                BLOCKING_SERIAL: 5422,
                BLOCKING_USER: 'SYS',
                BLOCKING_ET: 120,
                BLOCKING_PROGRAM: 'sqlplus.exe',
                BLOCKING_SQL: 'SELECT /*+ FULL(a) */ COUNT(*) FROM HUGE_TABLE a',
                OBJECT_NAME: 'PAYROLL'
            },
            {
                WAITING_SID: 600,
                WAITING_SERIAL: 123,
                WAITING_USER: 'HR_APP',
                WAITING_ET: 2,
                WAITING_SQL: 'INSERT INTO EMPLOYEES ...',
                LOCK_TYPE: 'TX',
                MODE_REQUESTED: 'Exclusive',
                BLOCKING_SID: 205,
                BLOCKING_SERIAL: 1120,
                BLOCKING_USER: 'HR',
                BLOCKING_ET: 45,
                BLOCKING_PROGRAM: 'JDBC Thin Client',
                BLOCKING_SQL: 'UPDATE EMPLOYEES SET SALARY = SALARY * 1.1 WHERE DEPT_ID = 10',
                OBJECT_NAME: 'EMPLOYEES'
            }
        ];
        // Filter out locks where either participant is killed
        return allLocks.filter(l =>
            !killedSessions.has(l.WAITING_SID.toString()) &&
            !killedSessions.has(l.BLOCKING_SID.toString())
        );
    }

    // 2. Metrics & Counts (CPU, Memory, I/O, Connection Count)
    if (uppercaseSql.includes('V$SYSMETRIC') && uppercaseSql.includes('CPU')) {
        return [{ VALUE: 25 + Math.random() * 30 }];
    }
    if (uppercaseSql.includes('V$SGA') || uppercaseSql.includes('V$PGASTAT')) {
        return [{ ORACLE_MEM: 8 * 1024 * 1024 * 1024, TOTAL_MEM: 16 * 1024 * 1024 * 1024 }];
    }
    if (uppercaseSql.includes('V$SYSMETRIC') && (uppercaseSql.includes('READ') || uppercaseSql.includes('WRITE'))) {
        return [{ VAL: (50 + Math.random() * 100) * 1024 * 1024 }];
    }
    if (uppercaseSql.includes('V$SESSION') && uppercaseSql.includes('COUNT')) {
        return [{ VAL: 42 + Math.floor(Math.random() * 10) }];
    }

    // 3. Session Check (Detailed list)
    if (uppercaseSql.includes('V$SESSION') || uppercaseSql.includes('SESS')) {
        const allSessions = [
            { SID: 101, SERIAL: 5422, USERNAME: 'SYS', STATUS: 'ACTIVE', OSUSER: 'oracle', MACHINE: 'db-srv-01', PROGRAM: 'sqlplus.exe', SQL_ID: '7m9qf2z1v8uph', SQL_TEXT: 'SELECT /*+ FULL(a) */ COUNT(*) FROM HUGE_TABLE a', LAST_CALL_ET: 120 },
            { SID: 205, SERIAL: 1120, USERNAME: 'HR', STATUS: 'ACTIVE', OSUSER: 'jdoe', MACHINE: 'workstation-12', PROGRAM: 'JDBC Thin Client', SQL_ID: 'bfz1p5x9w2m3k', SQL_TEXT: 'UPDATE EMPLOYEES SET SALARY = SALARY * 1.1 WHERE DEPT_ID = 10', LAST_CALL_ET: 45 },
            { SID: 312, SERIAL: 889, USERNAME: 'APP_USER', STATUS: 'ACTIVE', OSUSER: 'svc_acc', MACHINE: 'api-web-04', PROGRAM: 'node.exe', SQL_ID: 'c8y4v6j2n0t7s', SQL_TEXT: 'INSERT INTO AUDIT_LOGS (TS, MSG) VALUES (SYSDATE, "Login attempt")', LAST_CALL_ET: 2 },
            { SID: 445, SERIAL: 221, USERNAME: 'ERP_OWNER', STATUS: 'ACTIVE', OSUSER: 'websrv', MACHINE: 'app-server-01', PROGRAM: 'Oracle JDBC Driver', SQL_ID: 'd5k3m1r9p4q6g', SQL_TEXT: 'SELECT * FROM SALES_DATA WHERE REGION = "SEOUL" AND YYYYMM = "202401"', LAST_CALL_ET: 15 },
            { SID: 512, SERIAL: 9942, USERNAME: 'DBA_USER', STATUS: 'ACTIVE', OSUSER: 'admin', MACHINE: 'mgmt-pc-05', PROGRAM: 'SQL Developer', SQL_ID: 'e7w2z8v4n1m0p', SQL_TEXT: 'ANALYZE TABLE CUSTOMERS COMPUTE STATISTICS', LAST_CALL_ET: 280 },
        ];
        return allSessions.filter(s => !killedSessions.has(s.SID.toString()));
    }

    if (uppercaseSql.includes('TABLESPACE')) {
        return [
            { TABLESPACE_NAME: 'SYSTEM', USED_PCT: 85 + Math.random() * 5 },
            { TABLESPACE_NAME: 'SYSAUX', USED_PCT: 72 + Math.random() * 5 },
            { TABLESPACE_NAME: 'USERS', USED_PCT: 45 + Math.random() * 10 },
            { TABLESPACE_NAME: 'TEMP', USED_PCT: 12 + Math.random() * 5 },
            { TABLESPACE_NAME: 'UNDO', USED_PCT: 28 + Math.random() * 5 }
        ];
    }

    if (uppercaseSql.includes('REPORT_SQL_MONITOR')) {
        return [{
            REPORT: `
                <html>
                    <body style="background:#1e1e1e; color:#eee; font-family:sans-serif; padding:40px;">
                        <h1 style="color:#f97316;">SQL Monitoring Report (SIMULATION)</h1>
                        <hr style="border-color:#333;">
                        <div style="background:#2c2c2c; border:1px solid #444; padding:20px; border-radius:8px; margin-top:20px;">
                            <p><strong>SQL ID:</strong> ${sql.match(/'(.*?)'/)?.[1] || 'unknown'}</p>
                            <p><strong>Status:</strong> COMPLETED</p>
                            <p><strong>Duration:</strong> 12.5s</p>
                            <table style="width:100%; text-align:left; margin-top:20px; border-collapse:collapse;">
                                <tr style="background:#333;">
                                    <th style="padding:10px; border:1px solid #444;">Operation</th>
                                    <th style="padding:10px; border:1px solid #444;">Est. Rows</th>
                                    <th style="padding:10px; border:1px solid #444;">Actual Rows</th>
                                </tr>
                                <tr>
                                    <td style="padding:10px; border:1px solid #444;">SELECT STATEMENT</td>
                                    <td style="padding:10px; border:1px solid #444;">1</td>
                                    <td style="padding:10px; border:1px solid #444;">1</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px; border:1px solid #444;">TABLE ACCESS FULL</td>
                                    <td style="padding:10px; border:1px solid #444;">100K</td>
                                    <td style="padding:10px; border:1px solid #444;">100K</td>
                                </tr>
                            </table>
                        </div>
                    </body>
                </html>
            `
        }];
    }

    return [];
}
