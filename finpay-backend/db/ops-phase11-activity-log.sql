-- Ops ERP Phase 11 (Activity feed + notify channels) — foundation.
--
-- Every ops mutation (order create / status / payment, invoice, cancel / refund,
-- bulk ops) appends a row here so the admin's activity slide-over can show
-- "every change". Messages are stored per-language (en / id) so the EN/ID toggle
-- (Phase 12) can localise the feed without re-deriving it. `tone` is a CSS colour
-- for the row's status dot.
--
-- notify_channels holds the per-channel outbound toggles (whatsapp / email). When
-- a channel is enabled, lib/notify.ts mirrors each logged message to it (email is
-- wired via Resend; whatsapp is stubbed until a provider exists).
--
-- Apply to the live `ops` schema. Idempotent.

create table if not exists ops.activity_log (
  id         uuid primary key default gen_random_uuid(),
  ts         timestamptz not null default now(),
  actor      text,
  kind       text not null,
  message_en text not null,
  message_id text not null,
  tone       text not null default '#54300b'
);

create index if not exists activity_log_ts_idx on ops.activity_log (ts desc);

create table if not exists ops.notify_channels (
  channel    text primary key check (channel in ('whatsapp', 'email')),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Seed the known channels. Match the prototype's default (whatsapp toggle on,
-- email off) so a deploy sends NO surprise outbound: whatsapp is stubbed (no
-- provider yet, so nothing actually sends) and email is opt-in. Idempotent —
-- never clobbers an admin's later toggle.
insert into ops.notify_channels (channel, enabled) values
  ('whatsapp', true),
  ('email', false)
on conflict (channel) do nothing;
