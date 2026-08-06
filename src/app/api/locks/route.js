import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sql = `
      SELECT DISTINCT
        s1.sid AS WAITING_SID, 
        s1.serial# AS WAITING_SERIAL,
        NVL(s1.username, 'UNKNOWN') AS WAITING_USER,
        s1.last_call_et AS WAITING_ET,
        NVL(l1.type, 'TX') AS LOCK_TYPE, 
        DECODE(l1.lmode, 0, 'Exclusive (Requesting)', 1, 'Null', 2, 'Row-S', 3, 'Row-X', 4, 'Share', 5, 'S/Row-X', 6, 'Exclusive', 'Exclusive') AS MODE_REQUESTED,
        s2.sid AS BLOCKING_SID, 
        s2.serial# AS BLOCKING_SERIAL,
        NVL(s2.username, 'UNKNOWN') AS BLOCKING_USER,
        NVL(s2.program, 'Unknown Program') AS BLOCKING_PROGRAM,
        s2.last_call_et AS BLOCKING_ET,
        NVL(o.object_name, 'TABLE / ROW LOCK') AS OBJECT_NAME,
        q1.sql_text AS WAITING_SQL,
        q2.sql_text AS BLOCKING_SQL
      FROM v$session s1
      JOIN v$session s2 ON s1.blocking_session = s2.sid
      LEFT JOIN v$lock l1 ON s1.sid = l1.sid AND l1.request > 0
      LEFT JOIN dba_objects o ON s1.row_wait_obj# = o.object_id
      LEFT JOIN v$sql q1 ON s1.sql_id = q1.sql_id
      LEFT JOIN v$sql q2 ON s2.sql_id = q2.sql_id
      WHERE s1.blocking_session IS NOT NULL
    `;
    const data = await execute(sql);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

