import { execute } from '../../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const sql_id = searchParams.get('sql_id');

    if (!sql_id) {
        return NextResponse.json({ error: 'SQL_ID is required' }, { status: 400 });
    }

    try {
        const sql = `SELECT DBMS_SQLTUNE.REPORT_SQL_MONITOR(sql_id => :sql_id, type => 'HTML', report_level => 'ALL', event_detail => 'YES') as REPORT FROM DUAL`;
        const data = await execute(sql, { sql_id });

        if (data && data.length > 0) {
            // Normalize key name (Oracle might return REPORT or report depending on driver version/config)
            const reportContent = data[0].REPORT || data[0].report || data[0][Object.keys(data[0])[0]];

            if (!reportContent || reportContent.length < 10) {
                return new NextResponse(`
                    <div style="padding:20px; font-family:sans-serif; background:#fcedeb; color:#c53030; border:1px solid #feb2b2; border-radius:8px;">
                        <strong>No Data Found:</strong> The SQL Monitoring report for ID <code>${sql_id}</code> is empty. 
                        This usually happens if the SQL is no longer in the monitoring buffer or was not monitored.
                    </div>
                `, { headers: { 'Content-Type': 'text/html' } });
            }

            return new NextResponse(reportContent, {
                headers: {
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-store'
                }
            });
        }

        return NextResponse.json({ error: 'Failed to retrieve report' }, { status: 404 });
    } catch (err) {
        console.error('SQL Monitor Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
