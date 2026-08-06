import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // CPU Load (Host CPU)
        const cpuSql = `
            SELECT VALUE 
            FROM V$SYSMETRIC 
            WHERE METRIC_NAME = 'Host CPU Utilization (%)' 
            AND INTSIZE_CSEC = (SELECT MAX(INTSIZE_CSEC) FROM V$SYSMETRIC)
        `;

        // Memory (Oracle Memory Usage: SGA + PGA) relative to Host Memory
        const memSql = `
            SELECT 
                (SELECT SUM(VALUE) FROM V$SGA) + 
                (SELECT VALUE FROM V$PGASTAT WHERE NAME = 'total PGA allocated') as ORACLE_MEM,
                (SELECT VALUE FROM V$OSSTAT WHERE STAT_NAME = 'PHYSICAL_MEMORY_BYTES') as TOTAL_MEM
            FROM DUAL
        `;

        // I/O (Total Read+Write MB/s)
        const ioSql = `
            SELECT SUM(VALUE) as VAL
            FROM V$SYSMETRIC 
            WHERE METRIC_NAME IN ('Physical Read Total Bytes Per Sec', 'Physical Write Total Bytes Per Sec') 
            AND INTSIZE_CSEC = (SELECT MAX(INTSIZE_CSEC) FROM V$SYSMETRIC)
        `;

        // Connection Count
        const connSql = `SELECT COUNT(*) as VAL FROM V$SESSION`;

        const [cpuRes, memRes, ioRes, connRes] = await Promise.all([
            execute(cpuSql),
            execute(memSql),
            execute(ioSql),
            execute(connSql)
        ]);

        // Process CPU
        let cpu = 0;
        if (cpuRes && cpuRes.length > 0) cpu = cpuRes[0].VALUE;

        // Process Memory
        let mem = 0;
        if (memRes && memRes.length > 0) {
            const oracleMem = memRes[0].ORACLE_MEM;
            const totalMem = memRes[0].TOTAL_MEM;
            if (totalMem > 0) {
                mem = (oracleMem / totalMem) * 100;
            }
        }

        // Process I/O
        let io = 0;
        if (ioRes && ioRes.length > 0) {
            io = (ioRes[0].VAL || 0) / 1024 / 1024; // Convert to MB/s
        }

        // Process Connections
        let connections = 0;
        if (connRes) {
            // Check if it's mock (returning object) or real (returning array of rows)
            if (Array.isArray(connRes) && connRes.length > 0) {
                connections = connRes[0].VAL;
            } else if (connRes.connections) {
                connections = connRes.connections;
            }
        }

        return NextResponse.json({
            cpu: Math.round(cpu),
            memory: Math.round(mem),
            io: parseFloat(io.toFixed(1)),
            connections: connections
        });

    } catch (err) {
        console.error("Metrics API Error:", err);
        // Fallback for mock/error
        return NextResponse.json({ cpu: 15, memory: 45, io: 12.5 });
    }
}
