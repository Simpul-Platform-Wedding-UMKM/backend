import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

const BUCKET = env.supabaseBucket;

// ponytail: lazy client — createClient throws if URL/key kosong, jadi init
// hanya saat upload pertama kali (bukan saat server start).
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
            throw new Error(
                "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi",
            );
        }
        _supabase = createClient(
            env.supabaseUrl,
            env.supabaseServiceRoleKey,
            { auth: { persistSession: false } },
        );
    }
    return _supabase;
}

/**
 * Upload bytes to Supabase Storage and return the public URL.
 * Throws with a user-facing message on failure.
 * `folder` membedakan jenis file (avatars / kyb) — bucket tetap satu.
 */
export async function uploadFile(buffer, mimeType, ext, ownerId, folder = "avatars") {
    const path = `${folder}/${ownerId}/${Date.now()}.${ext}`;
    const { error } = await getSupabase().storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Upload gagal: ${error.message}`);

    const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
}
