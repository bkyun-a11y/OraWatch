import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sql = `
      SELECT 
        l1.sid as WAITING_SID, 
        s1.serial# as WAITING_SERIAL,
        s1.username as WAITING_USER,
        s1.last_call_et as WAITING_ET,
        l1.type as LOCK_TYPE, 
        DECODE(l1.lmode, 0, 'None', 1, 'Null', 2, 'Row-S (SS)', 3, 'Row-X (SX)', 4, 'Share', 5, 'S/Row-X (SSX)', 6, 'Exclusive', 'Unknown') as MODE_REQUESTED,
        l2.sid as BLOCKING_SID, 
        s2.serial# as BLOCKING_SERIAL,
        s2.username as BLOCKING_USER,
        s2.program as BLOCKING_PROGRAM,
        s2.last_call_et as BLOCKING_ET,
        o.object_name as OBJECT_NAME,
        q1.sql_text as WAITING_SQL,
        q2.sql_text as BLOCKING_SQL
      FROM v$lock l1
      JOIN v$session s1 ON l1.sid = s1.sid
      JOIN v$lock l2 ON l1.id1 = l2.id1 AND l1.id2 = l2.id2
      JOIN v$session s2 ON l2.sid = s2.sid
      LEFT JOIN dba_objects o ON l1.id1 = o.object_id
      LEFT JOIN v$sql q1 ON s1.sql_id = q1.sql_id
      LEFT JOIN v$sql q2 ON s2.sql_id = q2.sql_id
      WHERE l1.request > 0 
      AND l2.lmode > 0
    `;
    const data = await execute(sql);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
