
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
    const { data, error } = await supabase
        .from('product_popularity')
        .select('*')
        .limit(1);

    if (error) {
        console.error(error);
    } else {
        console.log('Columns:', data && data.length > 0 ? Object.keys(data[0]) : 'No data found, cannot infer columns');
    }
}

inspect();
