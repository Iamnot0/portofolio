create table if not exists portfolio_projects (
  id serial primary key,
  title text not null,
  purpose text not null default '',
  stack text not null default '',
  link text,
  image_url text,
  display_order int not null,
  published boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists portfolio_certificates (
  id serial primary key,
  title text not null,
  issuer_meta text not null default '',
  verify_url text,
  image_url text,
  display_order int not null,
  published boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists portfolio_cv (
  id int primary key check (id = 1),
  file_url text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists login_attempts (
  ip text,
  attempted_at timestamptz default now()
);

create table if not exists admin_totp_state (
  id int primary key check (id = 1),
  last_step bigint not null
);

create table if not exists contact_submissions (
  id serial primary key,
  ip text,
  name text,
  email text,
  company text,
  message text,
  created_at timestamptz default now()
);

create index if not exists login_attempts_ip_attempted_at_idx on login_attempts (ip, attempted_at);
create index if not exists contact_submissions_ip_created_at_idx on contact_submissions (ip, created_at);
