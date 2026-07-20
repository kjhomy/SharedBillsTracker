import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const MAX_BYTES = 8 * 1024 * 1024;

const receiptSchema = z.object({
  amount: z.number().nullable().describe('The total amount due or paid, as a plain number with no currency symbol.'),
  payee: z.string().nullable().describe('The name of the company or person the bill is owed to (e.g. the utility provider or landlord).'),
  date: z.string().nullable().describe('The most relevant date on the document in YYYY-MM-DD format — the due date if present, otherwise the bill or statement date.'),
});

// Authenticated-only: this calls a paid model, so it must never be
// reachable by a signed-out request.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json(
      { error: 'Only image receipts can be auto-extracted — PDFs need to be entered manually.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large to auto-extract.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { output } = await generateText({
      model: 'anthropic/claude-haiku-4.5',
      output: Output.object({ schema: receiptSchema }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the total amount, payee, and most relevant date from this bill or receipt photo. Use null for any field you cannot confidently determine — never guess.',
            },
            { type: 'file', data: bytes, mediaType: file.type },
          ],
        },
      ],
    });

    return NextResponse.json(output);
  } catch (error) {
    console.error('extract-receipt error', error);
    return NextResponse.json({ error: "Couldn't read this receipt automatically." }, { status: 502 });
  }
}
