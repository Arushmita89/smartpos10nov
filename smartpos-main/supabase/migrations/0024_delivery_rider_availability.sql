-- Keep rider availability in sync with active deliveries.
-- A rider with an active delivery is not available for new deliveries
-- (shown as busy/offline in the admin UI). When the order is completed or
-- cancelled the rider automatically becomes available again.

create or replace function public.sync_rider_availability(target_rider_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  active_count integer;
begin
  if target_rider_id is null then
    return;
  end if;

  select count(*) into active_count
  from public.delivery_assignments
  where rider_id = target_rider_id
    and status in ('assigned', 'accepted', 'picked_up');

  update public.users
  set rider_status = case when active_count > 0 then 'busy' else 'available' end
  where id = target_rider_id
    and role = 'rider';
end;
$$;

create or replace function public.sync_delivery_on_order_close()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.order_type = 'delivery'
     and new.status in ('completed', 'cancelled')
     and (old.status is distinct from new.status) then
    update public.delivery_assignments
    set status = case when new.status = 'completed' then 'delivered' else 'cancelled' end,
        delivered_at = case
          when new.status = 'completed' then coalesce(delivered_at, now())
          else delivered_at
        end,
        cancelled_at = case
          when new.status = 'cancelled' then coalesce(cancelled_at, now())
          else cancelled_at
        end,
        updated_at = now()
    where order_id = new.id
      and status in ('assigned', 'accepted', 'picked_up');

    perform public.sync_rider_availability(new.delivery_rider_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_delivery_close on public.orders;
create trigger trg_orders_delivery_close
after update of status on public.orders
for each row
execute function public.sync_delivery_on_order_close();

-- Backfill riders stuck as busy without an active delivery.
update public.users u
set rider_status = 'available'
where u.role = 'rider'
  and u.rider_status = 'busy'
  and not exists (
    select 1
    from public.delivery_assignments da
    where da.rider_id = u.id
      and da.status in ('assigned', 'accepted', 'picked_up')
  );
