import { execute } from '../../../../lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { sid, serial } = await request.json();

        if (!sid || !serial) {
            return NextResponse.json({ error: 'SID and Serial are required' }, { status: 400 });
        }

        // AWS RDS specific procedure for killing sessions
        const sql = `
            BEGIN
                rdsadmin.rdsadmin_util.kill(
                    sid    => :sid, 
                    serial => :serial,
                    method => 'IMMEDIATE'
                );
            END;
        `;

        await execute(sql, { sid, serial });

        return NextResponse.json({ success: true, message: `Session ${sid},${serial} killed` });
    } catch (err) {
        console.error('Kill Session Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
