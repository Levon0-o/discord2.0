/*
  Read-only preview for authenticated server invitation links.
  Exposes only the public-facing server details needed by the invite landing card.
*/
create or replace function public.preview_server_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_server public.servers%rowtype;
  v_user_id uuid := auth.uid();
  v_valid boolean;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to preview an invitation.';
  end if;

  if p_code is null or length(trim(p_code)) < 8 or length(trim(p_code)) > 100 then
    return null;
  end if;

  select i.* into v_invitation
    from public.invitations as i
   where lower(i.code) = lower(trim(p_code))
   limit 1;

  if not found then return null; end if;

  select s.* into v_server
    from public.servers as s
   where s.id = v_invitation.server_id;

  if not found then return null; end if;

  v_valid :=
    v_invitation.revoked_at is null
    and (v_invitation.expires_at is null or v_invitation.expires_at > now())
    and (v_invitation.max_uses is null or v_invitation.uses < v_invitation.max_uses)
    and (v_invitation.invited_user_id is null or v_invitation.invited_user_id = v_user_id);

  return jsonb_build_object(
    'server_id', v_server.id,
    'name', v_server.name,
    'description', v_server.description,
    'icon_url', v_server.icon_url,
    'banner_url', v_server.banner_url,
    'theme_color', v_server.theme_color,
    'member_count', (select count(*) from public.server_members sm where sm.server_id = v_server.id),
    'valid', v_valid
  );
end;
$$;

revoke all on function public.preview_server_invitation(text) from public, anon;
grant execute on function public.preview_server_invitation(text) to authenticated;
