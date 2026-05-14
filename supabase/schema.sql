-- ============================================
-- EventScan MVP - Supabase Schema
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES (lié à auth.users de Supabase)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  role text not null default 'organizer' check (role in ('admin', 'organizer')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- EVENTS
-- ============================================
create table public.events (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  date timestamptz not null,
  location text,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;

create policy "Organizers can manage their own events"
  on public.events for all
  using (owner_id = auth.uid());

create policy "Admin can manage all events"
  on public.events for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- GUESTS
-- ============================================
create table public.guests (
  id uuid default uuid_generate_v4() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  category text,        -- nom table/catégorie
  table_name text,      -- table assignée
  qr_token text unique not null default uuid_generate_v4()::text,
  checked_in boolean default false,
  checked_in_at timestamptz,
  created_at timestamptz default now()
);

alter table public.guests enable row level security;

create policy "Organizers can manage guests of their events"
  on public.guests for all
  using (
    exists (
      select 1 from public.events
      where id = event_id and owner_id = auth.uid()
    )
  );

create policy "Admin can manage all guests"
  on public.guests for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Accès public pour scan QR (lecture seule via token)
create policy "Public can read guest by qr_token"
  on public.guests for select
  using (true);

-- ============================================
-- SCAN LOGS
-- ============================================
create table public.scan_logs (
  id uuid default uuid_generate_v4() primary key,
  guest_id uuid references public.guests(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  scanned_at timestamptz default now(),
  scanned_by uuid references public.profiles(id),
  status text not null check (status in ('success', 'already_scanned', 'invalid'))
);

alter table public.scan_logs enable row level security;

create policy "Organizers can view scan logs of their events"
  on public.scan_logs for all
  using (
    exists (
      select 1 from public.events
      where id = event_id and owner_id = auth.uid()
    )
  );

create policy "Admin can view all scan logs"
  on public.scan_logs for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- TRIGGER: auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'organizer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- INDEX pour performance
-- ============================================
create index guests_event_id_idx on public.guests(event_id);
create index guests_qr_token_idx on public.guests(qr_token);
create index events_owner_id_idx on public.events(owner_id);
create index scan_logs_event_id_idx on public.scan_logs(event_id);
