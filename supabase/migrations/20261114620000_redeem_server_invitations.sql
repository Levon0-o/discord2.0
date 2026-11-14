/*
  Server invitation redemption.
  Codes are consumed atomically under a row lock so concurrent requests cannot
  exceed max_uses. Private servers can only be joined through a valid invite.
*/
create or replace function public.redeem_server_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to use an invitation.';
  end if;

  if p_code is null or length(trim(p_code)) < 8 or length(trim(p_code)) > 100 then
    raise exception 'This invitation code is invalid or unavailable.';
  end if;

  select i.*
    into v_invitation
    from public.invitations as i
   where lower(i.code) = lower(trim(p_code))
   for update;

  if not found
     or v_invitation.revoked_at is not null
     or (v_invitation.expires_at is not null and v_invitation.expires_at <= now())
     or (v_invitation.max_uses is not null and v_invitation.uses >= v_invitation.max_uses)
     or (v_invitation.invited_user_id is not null and v_invitation.invited_user_id <> v_user_id) then
    raise exception 'This invitation is invalid, expired, revoked, or has reached its use limit.';
  end if;

  if exists (
    select 1
      from public.server_members as sm
     where sm.server_id = v_invitation.server_id
       and sm.user_id = v_user_id
  ) then
    return v_invitation.server_id;
  end if;

  insert into public.server_members (server_id, user_id, role)
  values (v_invitation.server_id, v_user_id, 'member')
  on conflict (server_id, user_id) do nothing;

  update public.invitations
     set uses = uses + 1
   where id = v_invitation.id;

  return v_invitation.server_id;
end;
$$;

revoke all on function public.redeem_server_invitation(text) from public, anon;
grant execute on function public.redeem_server_invitation(text) to authenticated;
