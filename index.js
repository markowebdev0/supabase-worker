import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

console.log('worker started — listening for new notes...');

supabase
    .channel('notes-worker')
    .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'notes'
        },
        async (payload) => {
            const note = payload.new;
            console.log('new note received:', note.title);

            // skip if already has a summary
            if (note.summary) return;

            try {
                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'Summarize the following note in one clear sentence. Be concise.'
                        },
                        {
                            role: 'user',
                            content: `Title: ${note.title}\nContent: ${note.content || ''}`
                        }
                    ],
                    max_tokens: 100
                });

                const summary = response.choices[0].message.content.trim();
                console.log('summary generated:', summary);

                // save summary back to the note
                const { error } = await supabase
                    .from('notes')
                    .update({ summary })
                    .eq('id', note.id);

                if (error) console.error('update error:', error);
                else console.log('summary saved for:', note.title);

            } catch (err) {
                console.error('openai error:', err.message);
            }
        }
    )
    .subscribe();

// keep process alive
process.stdin.resume();