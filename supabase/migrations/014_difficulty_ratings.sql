-- 014: 众包难度评分（任何登录用户可对每题打 1–5 星，展示全站平均）
-- 手动在 Supabase SQL Editor 运行（本项目无 DDL/CLI 权限）。幂等。

-- 1) 评分明细表：每个用户对每题至多一条，可改。
create table if not exists question_difficulty_ratings (
  question_id uuid not null references questions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- 2) questions 上的去规范化聚合列：count + sum，avg 由 sum/count 生成，便于排序与展示。
alter table questions add column if not exists rating_count integer not null default 0;
alter table questions add column if not exists rating_sum   integer not null default 0;
alter table questions add column if not exists rating_avg   numeric(3,2)
  generated always as (case when rating_count > 0 then round(rating_sum::numeric / rating_count, 2) else 0 end) stored;

-- 3) 触发器：增/改/删评分时，原子维护 questions.rating_count / rating_sum。
create or replace function bump_question_rating() returns trigger
  language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update questions set rating_count = rating_count + 1, rating_sum = rating_sum + new.rating
      where id = new.question_id;
  elsif (tg_op = 'UPDATE') then
    update questions set rating_sum = rating_sum + new.rating - old.rating
      where id = new.question_id;
  elsif (tg_op = 'DELETE') then
    update questions set rating_count = greatest(rating_count - 1, 0),
                         rating_sum   = greatest(rating_sum - old.rating, 0)
      where id = old.question_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_question_rating on question_difficulty_ratings;
create trigger trg_question_rating
  after insert or update or delete on question_difficulty_ratings
  for each row execute function bump_question_rating();

-- 4) RLS：平均分（在 questions 列上）公开可读；明细表里用户只能读写自己的行，但允许所有人读（用于统计）。
alter table question_difficulty_ratings enable row level security;

drop policy if exists "ratings_select_all" on question_difficulty_ratings;
create policy "ratings_select_all" on question_difficulty_ratings
  for select using (true);

drop policy if exists "ratings_insert_own" on question_difficulty_ratings;
create policy "ratings_insert_own" on question_difficulty_ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "ratings_update_own" on question_difficulty_ratings;
create policy "ratings_update_own" on question_difficulty_ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings_delete_own" on question_difficulty_ratings;
create policy "ratings_delete_own" on question_difficulty_ratings
  for delete using (auth.uid() = user_id);
