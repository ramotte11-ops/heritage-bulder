-- 06-F1 operational rollback. Keep the immutable term ledger and future anchors.
alter policy memorial_videos_select_own on public.memorial_videos
  using (owner_id = public.current_owner_id());
alter policy memorials_select_own on public.memorials
  using (owner_id = public.current_owner_id());
alter policy memorials_update_own on public.memorials
  using (owner_id = public.current_owner_id())
  with check (owner_id = public.current_owner_id());
drop trigger if exists memorial_published_snapshots_guard_expired_complete on public.memorial_published_snapshots;
drop function if exists public.guard_expired_complete_publication_v1();

create or replace function public.memorial_publicly_visible_v1(p_memorial_id uuid, p_now timestamptz)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select m.status = 'published'
           and (m.access_level = 'complet'
                or (m.access_level = 'avis'
                    and m.free_public_until is not null
                    and p_now < m.free_public_until))
      from public.memorials m
     where m.id = p_memorial_id
  ), false);
$$;

comment on function public.memorial_publicly_visible_v1(uuid, timestamptz) is
  'QG 008. Un mémorial est public s''il est publié et, pour un avis, avant free_public_until (45 j). Interne.';

create or replace function public.sign_symbolic_offering_v1(
  p_slug text,
  p_idempotency_key uuid,
  p_signature text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_existing text;
begin
  if nullif(btrim(p_slug), '') is null
     or p_idempotency_key is null
     or p_signature is null
     or char_length(p_signature) not between 1 and 40
     or p_signature <> btrim(p_signature)
     or p_signature ~ '[[:cntrl:]]'
     or p_signature ~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]' then
    raise exception 'invalid symbolic offering signature request' using errcode = '22023';
  end if;

  select m.id into v_memorial_id
    from public.memorials as m
   where m.slug = p_slug;

  if v_memorial_id is null then
    return query select 'refused'::text;
    return;
  end if;

  -- Une seule instruction : la ligne est verrouillée par l'UPDATE ; deux
  -- envois concurrents ne peuvent pas signer deux fois le même geste.
  update public.symbolic_offerings as o
     set signature = p_signature,
         signed_at = v_now
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key
     and o.signature is null
     and o.created_at > v_now - interval '30 minutes';

  if found then
    return query select 'signed'::text;
    return;
  end if;

  select o.signature into v_existing
    from public.symbolic_offerings as o
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key;

  if v_existing is not null and v_existing = p_signature then
    return query select 'already_signed'::text;
    return;
  end if;

  return query select 'refused'::text;
end;
$$;

grant execute on function public.sign_symbolic_offering_v1(text, uuid, text) to service_role;

notify pgrst, 'reload schema';
