
import { supabaseServer } from './supabase-server';

export type Profile = {
  id: string;
  role: 'manager' | 'driver';
  display_name: string;
  inspector_ids: string[];
};

export async function getViewer() {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('[AUTH] Session failed');
    return null;
  }

  const {
    data: profile,
    error: profileError
  } = await supabase
    .from('profiles')
    .select('id,full_name,role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error(
      '[AUTH] Profile lookup failed:',
      profileError?.message
    );
    return null;
  }

  if (!['manager', 'driver'].includes(profile.role)) {
    console.error('[AUTH] Invalid profile role');
    return null;
  }

  console.log('[AUTH] Profile verified:', profile.role);

  return {
    user,
    profile: {
      id: profile.id,
      role: profile.role,
      display_name: profile.full_name || '',
      inspector_ids: []
    } as Profile
  };
}
