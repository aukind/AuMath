# 重新生成 types/supabase.ts

本仓没有 Supabase CLI 登录态、也没有 DB 密码（见 CLAUDE.md / 项目约定），
`supabase gen types --project-id` 与 `--db-url`（指向线上）都走不通；
`--db-url` 指向本地时 CLI 还要求 Docker。因此采用「本地重放迁移 + postgres-meta 直连」方案：

## 步骤

1. **本地起一个临时 Postgres**（Homebrew，需 `postgresql@17` + `pgvector`）：

   ```bash
   export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # macOS 必须，否则 initdb/postmaster 报 locale 错
   PGBIN=/opt/homebrew/opt/postgresql@17/bin
   $PGBIN/initdb -D /tmp/pgdata-typegen -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8
   $PGBIN/pg_ctl -D /tmp/pgdata-typegen -o "-p 54330 -k /tmp" -l /tmp/pg.log start
   $PGBIN/psql -h /tmp -p 54330 -U postgres -c "create database mathdb"
   ```

2. **建 Supabase 环境 stub**（角色 anon/authenticated/service_role；auth/storage schema：
   `auth.users(含 raw_app_meta_data)`、`auth.uid()/role()/jwt()`、
   `storage.buckets/objects/foldername()`），然后按文件名顺序重放 `supabase/migrations/*.sql`。

3. **用 @supabase/postgres-meta 生成**（与 Supabase 官方 typegen 同一引擎，无需 Docker）：

   ```js
   // gen.mjs —— npm i @supabase/postgres-meta 后执行 node gen.mjs > raw.ts
   import { PostgresMeta } from '@supabase/postgres-meta';
   import { apply } from '@supabase/postgres-meta/dist/server/templates/typescript.js';
   import { getGeneratorMetadata } from '@supabase/postgres-meta/dist/lib/generators.js';
   const pgMeta = new PostgresMeta({ connectionString: 'postgresql://postgres@127.0.0.1:54330/mathdb' });
   const { data } = await getGeneratorMetadata(pgMeta, { includedSchemas: ['public'], excludedSchemas: [] });
   process.stdout.write(await apply({ ...data, detectOneToOneRelationships: true }));
   ```

4. **按线上实际 schema 校正**（迁移与线上有历史漂移；线上才是真相）。
   用 service_role key 拉 PostgREST OpenAPI 对比：
   `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/?apikey=$SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"`
   （`definitions` = 各表列；`required` = NOT NULL 列）。当前已知漂移（生成后需手动改回）：
   - `questions`：线上**多** `analysis`（NOT NULL 无默认）与 `paper_id`（可空 FK→papers）；
     `solution` 线上有默认 `''`（Insert 可省）；`difficulty/metadata/variations` 线上**可空**。
   - `question_topic_relations`：线上**没有** `is_primary` / `created_at`。
   - `profiles`：线上**没有** `username_changed_at`。
   - 手动放宽（JS 侧的实际写入形态）：`geometry_figures.phash` Insert/Update 与
     `match_geometry_phash.query_phash` 放宽为 `number | string`（BIGINT 防精度丢失传字符串）；
     `questions.embedding` Insert/Update 与 `match_questions.query_embedding` 放宽为
     `string | number[]`（pgvector 接受 JSON 数组）。

5. 结果写入 `types/supabase.ts`（保留文件头注释），跑 `npx tsc --noEmit` 验证。

## 用后清理

```bash
$PGBIN/pg_ctl -D /tmp/pgdata-typegen stop && rm -rf /tmp/pgdata-typegen
```
