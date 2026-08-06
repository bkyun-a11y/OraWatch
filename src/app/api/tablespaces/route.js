import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const query = `
            SELECT TABLESPACE_NAME, 
                   ROUND(USED_PERCENT, 1) AS USED_PCT,
                   ROUND(TABLESPACE_SIZE * 8192 / 1024 / 1024 / 1024, 2) as TOTAL_GB
            FROM DBA_TABLESPACE_USAGE_METRICS
            ORDER BY USED_PERCENT DESC
            FETCH FIRST 5 ROWS ONLY
        `;

        const rows = await execute(query);

        // Mock data fallback handled in execute() if mockMode is on, 
        // but let's confirm explicit mock data structure if execute returns empty/null in mock mode for this specific query
        if (!rows || rows.length === 0) {
            return NextResponse.json([
                { TABLESPACE_NAME: 'SYSTEM', USED_PCT: 45.2, TOTAL_GB: 10 },
                { TABLESPACE_NAME: 'SYSAUX', USED_PCT: 88.5, TOTAL_GB: 5 },
                { TABLESPACE_NAME: 'USERS', USED_PCT: 12.0, TOTAL_GB: 100 },
                { TABLESPACE_NAME: 'UNDOTBS1', USED_PCT: 5.4, TOTAL_GB: 20 },
                { TABLESPACE_NAME: 'TEMP', USED_PCT: 0, TOTAL_GB: 50 },
            ]);
        }

        return NextResponse.json(rows);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
