-- Cuenta autorizada de administración: josegood222@gmail.com
-- Crea la cuenta desde Supabase Auth y desactiva el registro público en Authentication > Settings.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  town_hall text not null check (char_length(town_hall) between 1 and 30),
  category text not null check (category in ('legend', 'war', 'defense', 'bundle', 'free')),
  description text not null check (char_length(description) between 1 and 400),
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  free_link text,
  bundle_count integer not null default 0 check (bundle_count between 0 and 100),
  is_free boolean not null default false,
  is_published boolean not null default false,
  constraint free_product_price check ((is_free and price = 0 and category = 'free' and free_link is not null) or (not is_free and price > 0 and category <> 'free' and free_link is null))
);

create table if not exists public.product_deliveries (
  product_id uuid primary key references public.products(id) on delete cascade,
  design_link text not null check (design_link like 'https://%')
);

alter table public.products enable row level security;
alter table public.product_deliveries enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_deliveries to authenticated;

drop policy if exists "Published products are public" on public.products;
create policy "Published products are public"
  on public.products for select to anon, authenticated
  using (is_published = true);

drop policy if exists "Owner manages products" on public.products;
create policy "Owner manages products"
  on public.products for all to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'))
  with check (lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'));

drop policy if exists "Owner manages private delivery links" on public.product_deliveries;
create policy "Owner manages private delivery links"
  on public.product_deliveries for all to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'))
  with check (lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are public" on storage.objects;
create policy "Product images are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Owner uploads product images" on storage.objects;
create policy "Owner uploads product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'));

drop policy if exists "Owner updates product images" on storage.objects;
create policy "Owner updates product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'))
  with check (bucket_id = 'product-images' and lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'));

drop policy if exists "Owner deletes product images" on storage.objects;
create policy "Owner deletes product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and lower(auth.jwt() ->> 'email') = lower('josegood222@gmail.com'));
