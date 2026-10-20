-- Pointer to the Stripe Customer for the $5/mo household plan.
-- Not a balance. Cutoff does not store funds or a wallet.
alter table public.households
  add column stripe_customer_id text;

create unique index households_stripe_customer_id_uidx
  on public.households (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.households.stripe_customer_id is
  'Stripe Customer id (cus_). No stored balance and no held funds.';
