import { execute } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sql = `
      SELECT 
        s.sid, s.serial# as SERIAL, s.username, s.status, s.osuser, s.machine, s.program,
        s.sql_id, q.sql_text, s.last_call_et
      FROM v$session s
      LEFT JOIN v$sql q ON s.sql_id = q.sql_id
      WHERE s.status = 'ACTIVE' 
      AND s.type != 'BACKGROUND'
      ORDER BY s.last_call_et DESC
    `;
    const data = await execute(sql);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
