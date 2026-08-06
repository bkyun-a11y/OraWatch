import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = `
      SELECT DISTINCT
        w.waiting_session AS WAITING_SID,
        s1.serial# AS WAITING_SERIAL,
        NVL(s1.username, 'UNKNOWN') AS WAITING_USER,
        s1.last_call_et AS WAITING_ET,
        w.lock_type AS LOCK_TYPE,
        w.mode_requested AS MODE_REQUESTED,
        w.holding_session AS BLOCKING_SID,
        s2.serial# AS BLOCKING_SERIAL,
        NVL(s2.username, 'UNKNOWN') AS BLOCKING_USER,
        NVL(s2.program, 'Unknown Program') AS BLOCKING_PROGRAM,
        s2.last_call_et AS BLOCKING_ET,
        NVL(o.object_name, 'ROW / TABLE LOCK') AS OBJECT_NAME,
        q1.sql_text AS WAITING_SQL,
        q2.sql_text AS BLOCKING_SQL
      FROM dba_waiters w
      JOIN v$session s1 ON w.waiting_session = s1.sid
      JOIN v$session s2 ON w.holding_session = s2.sid
      LEFT JOIN dba_objects o ON s1.row_wait_obj# = o.object_id
      LEFT JOIN v$sql q1 ON s1.sql_id = q1.sql_id
      LEFT JOIN v$sql q2 ON s2.sql_id = q2.sql_id
    `;
    const data = await execute(sql);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


