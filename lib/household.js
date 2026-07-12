// Single-household assumption for Phase 1 — a signed-in user belongs to
// exactly one active household. Multi-household support is out of scope
// until it's actually needed.
export async function getHousehold(supabase, userId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name')
    .eq('user_id', userId)
    .eq('auth_active', true)
    .single();

  if (error) return null;
  return data;
}
