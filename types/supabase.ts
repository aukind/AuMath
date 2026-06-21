// ============================================================
// Supabase 数据库类型 — 由 supabase/migrations 在本地 Postgres 重放后
// 经 @supabase/postgres-meta typegen 生成，并按线上 PostgREST OpenAPI
// 实际 schema 校正（questions.analysis/paper_id、difficulty/metadata/
// variations 可空、question_topic_relations 无 is_primary/created_at、
// profiles 无 username_changed_at）。另：geometry_figures.phash 为
// BIGINT，JS 侧以字符串写入避免 64 位精度丢失，故 Insert/RPC 放宽为
// number | string；questions.embedding 与 match_questions.query_embedding
// 为 pgvector，PostgREST 接受 JSON 数组，放宽为 string | number[]。
// 重新生成：见 scripts/gen-db-types.md
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_audit_logs: {
        Row: {
          id: string
          user_id: string
          surface: string
          tool: string
          scopes: string[]
          mutates: boolean
          confirmed: boolean
          status: string
          input: Json
          result: Json | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          surface?: string
          tool: string
          scopes?: string[]
          mutates?: boolean
          confirmed?: boolean
          status: string
          input?: Json
          result?: Json | null
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          surface?: string
          tool?: string
          scopes?: string[]
          mutates?: boolean
          confirmed?: boolean
          status?: string
          input?: Json
          result?: Json | null
          error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      forum_comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "forum_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comment_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_post_favorites: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_post_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_post_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_post_votes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_post_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_featured: boolean
          is_pinned: boolean
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_featured?: boolean
          is_pinned?: boolean
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          is_pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_sub_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          parent_id: string
          reply_to_user_id: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          parent_id: string
          reply_to_user_id?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string
          reply_to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_sub_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_sub_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "forum_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_sub_comments_reply_to_user_id_fkey"
            columns: ["reply_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      geometry_figures: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inline_svg: string | null
          labels: Json
          overpic_latex: string | null
          phash: number | null
          pipeline: string
          svg: string | null
          tikz: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inline_svg?: string | null
          labels?: Json
          overpic_latex?: string | null
          phash?: number | string | null
          pipeline: string
          svg?: string | null
          tikz?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inline_svg?: string | null
          labels?: Json
          overpic_latex?: string | null
          phash?: number | string | null
          pipeline?: string
          svg?: string | null
          tikz?: string | null
        }
        Relationships: []
      }
      journal_articles: {
        Row: {
          abstract: string | null
          authors: string[]
          created_at: string
          id: string
          issue: string | null
          journal_name: string | null
          published_on: string | null
          source_key: string | null
          source_url: string | null
          tags: string[]
          title: string
        }
        Insert: {
          abstract?: string | null
          authors?: string[]
          created_at?: string
          id?: string
          issue?: string | null
          journal_name?: string | null
          published_on?: string | null
          source_key?: string | null
          source_url?: string | null
          tags?: string[]
          title: string
        }
        Update: {
          abstract?: string | null
          authors?: string[]
          created_at?: string
          id?: string
          issue?: string | null
          journal_name?: string | null
          published_on?: string | null
          source_key?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
        }
        Relationships: []
      }
      latex_documents: {
        Row: {
          content: string
          created_at: string
          engine: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          engine?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          engine?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      library_item_reports: {
        Row: {
          created_at: string
          item_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_item_reports_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      library_item_upvotes: {
        Row: {
          created_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_item_upvotes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          author_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          download_count: number
          edu_stage: string
          id: string
          is_official: boolean
          pdf_url: string
          report_count: number
          resource_type: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          upvote_count: number
          view_count: number
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          download_count?: number
          edu_stage?: string
          id?: string
          is_official?: boolean
          pdf_url: string
          report_count?: number
          resource_type?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          upvote_count?: number
          view_count?: number
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          download_count?: number
          edu_stage?: string
          id?: string
          is_official?: boolean
          pdf_url?: string
          report_count?: number
          resource_type?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          upvote_count?: number
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_items_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_questions: {
        Row: {
          paper_id: string
          question_id: string
          question_number: number
        }
        Insert: {
          paper_id: string
          question_id: string
          question_number: number
        }
        Update: {
          paper_id?: string
          question_id?: string
          question_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      papers: {
        Row: {
          contest: string | null
          created_at: string
          created_by: string | null
          grade: string | null
          id: string
          is_public: boolean
          region: string | null
          title: string
          track: string
          type: string
          updated_at: string
          year: number | null
        }
        Insert: {
          contest?: string | null
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          is_public?: boolean
          region?: string | null
          title: string
          track?: string
          type?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          contest?: string | null
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          is_public?: boolean
          region?: string | null
          title?: string
          track?: string
          type?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          role: string
          updated_at: string
          user_no: number
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          role?: string
          updated_at?: string
          user_no: number
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_no?: number
          username?: string
        }
        Relationships: []
      }
      question_difficulty_ratings: {
        Row: {
          created_at: string
          question_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_difficulty_ratings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_topic_relations: {
        Row: {
          question_id: string
          topic_id: string
        }
        Insert: {
          question_id: string
          topic_id: string
        }
        Update: {
          question_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_topic_relations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_topic_relations_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          analysis: string
          answer: string
          content: string
          created_at: string
          created_by: string | null
          difficulty: number | null
          embedding: string | null
          id: string
          interactive_sandbox: Json | null
          is_public: boolean
          metadata: Json | null
          paper_id: string | null
          question_type: Database["public"]["Enums"]["question_type"]
          rating_avg: number | null
          rating_count: number
          rating_sum: number
          solution: string
          source: string | null
          status: Database["public"]["Enums"]["question_status"]
          updated_at: string
          variations: Json | null
          year: number | null
        }
        Insert: {
          analysis: string
          answer: string
          content: string
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          embedding?: string | number[] | null
          id?: string
          interactive_sandbox?: Json | null
          is_public?: boolean
          metadata?: Json | null
          paper_id?: string | null
          question_type?: Database["public"]["Enums"]["question_type"]
          rating_avg?: number | null
          rating_count?: number
          rating_sum?: number
          solution?: string
          source?: string | null
          status?: Database["public"]["Enums"]["question_status"]
          updated_at?: string
          variations?: Json | null
          year?: number | null
        }
        Update: {
          analysis?: string
          answer?: string
          content?: string
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          embedding?: string | number[] | null
          id?: string
          interactive_sandbox?: Json | null
          is_public?: boolean
          metadata?: Json | null
          paper_id?: string | null
          question_type?: Database["public"]["Enums"]["question_type"]
          rating_avg?: number | null
          rating_count?: number
          rating_sum?: number
          solution?: string
          source?: string | null
          status?: Database["public"]["Enums"]["question_status"]
          updated_at?: string
          variations?: Json | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_statistics: {
        Row: {
          id: number
          total_views: number
        }
        Insert: {
          id?: number
          total_views?: number
        }
        Update: {
          id?: number
          total_views?: number
        }
        Relationships: []
      }
      solving_sessions: {
        Row: {
          created_at: string
          duration_sec: number
          hints_used: number
          id: string
          max_hint_level: number
          note: string | null
          outcome: string
          question_id: string
          scratch_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number
          hints_used?: number
          id?: string
          max_hint_level?: number
          note?: string | null
          outcome?: string
          question_id: string
          scratch_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number
          hints_used?: number
          id?: string
          max_hint_level?: number
          note?: string | null
          outcome?: string
          question_id?: string
          scratch_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solving_sessions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          description: string | null
          exam_date: string
          id: string
          is_featured: boolean
          level: string
          location: string | null
          name: string
          registration_deadline: string | null
          short_name: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_date: string
          id?: string
          is_featured?: boolean
          level?: string
          location?: string | null
          name: string
          registration_deadline?: string | null
          short_name?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_date?: string
          id?: string
          is_featured?: boolean
          level?: string
          location?: string | null
          name?: string
          registration_deadline?: string | null
          short_name?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      theorems: {
        Row: {
          created_at: string
          description: string | null
          figure_url: string | null
          id: string
          name: string
          proof: string
          slug: string
          statement: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          figure_url?: string | null
          id?: string
          name: string
          proof?: string
          slug: string
          statement?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          figure_url?: string | null
          id?: string
          name?: string
          proof?: string
          slug?: string
          statement?: string
          updated_at?: string
        }
        Relationships: []
      }
      theorem_topic_relations: {
        Row: {
          theorem_id: string
          topic_id: string
        }
        Insert: {
          theorem_id: string
          topic_id: string
        }
        Update: {
          theorem_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theorem_topic_relations_theorem_id_fkey"
            columns: ["theorem_id"]
            isOneToOne: false
            referencedRelation: "theorems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theorem_topic_relations_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      theorem_question_relations: {
        Row: {
          question_id: string
          theorem_id: string
        }
        Insert: {
          question_id: string
          theorem_id: string
        }
        Update: {
          question_id?: string
          theorem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theorem_question_relations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theorem_question_relations_theorem_id_fkey"
            columns: ["theorem_id"]
            isOneToOne: false
            referencedRelation: "theorems"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_links: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          source_topic_id: string
          target_topic_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          source_topic_id: string
          target_topic_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          source_topic_id?: string
          target_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_links_source_topic_id_fkey"
            columns: ["source_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_links_target_topic_id_fkey"
            columns: ["target_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          level: number
          name: string
          order_index: number
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name: string
          order_index?: number
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name?: string
          order_index?: number
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          library_item_id: string | null
          pdf_url: string
          source: string
          title: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          library_item_id?: string | null
          pdf_url: string
          source?: string
          title: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          library_item_id?: string | null
          pdf_url?: string
          source?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_library_item_id_fkey"
            columns: ["library_item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_errors: {
        Row: {
          created_at: string
          difficulty: number
          due: string
          elapsed_days: number
          lapses: number
          last_review: string | null
          question_id: string
          reps: number
          scheduled_days: number
          stability: number
          state: number
          updated_at: string
          user_id: string
          wrong_count: number
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          lapses?: number
          last_review?: string | null
          question_id: string
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id: string
          wrong_count?: number
        }
        Update: {
          created_at?: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          lapses?: number
          last_review?: string | null
          question_id?: string
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_errors_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          body_md: string
          created_at: string
          id: string
          is_public: boolean
          metadata: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_md?: string
          created_at?: string
          id?: string
          is_public?: boolean
          metadata?: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          is_public?: boolean
          metadata?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      note_links: {
        Row: {
          created_at: string
          id: string
          note_id: string
          target_id: string | null
          target_label: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_id: string
          target_id?: string | null
          target_label: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          note_id?: string
          target_id?: string | null
          target_label?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_links_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "user_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          created_at: string
          folder_id: string | null
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favorites_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "favorite_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_history: {
        Row: {
          question_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          question_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          question_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_question_attempts: {
        Row: {
          attempt_count: number
          correct_count: number
          last_correct: boolean | null
          question_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          correct_count?: number
          last_correct?: boolean | null
          question_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          correct_count?: number
          last_correct?: boolean | null
          question_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_review_logs: {
        Row: {
          created_at: string
          difficulty: number | null
          due: string | null
          duration_ms: number
          elapsed_days: number | null
          id: number
          last_elapsed_days: number | null
          question_id: string
          rating: number
          review: string
          scheduled_days: number | null
          stability: number | null
          state: number
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          due?: string | null
          duration_ms?: number
          elapsed_days?: number | null
          id?: number
          last_elapsed_days?: number | null
          question_id: string
          rating: number
          review: string
          scheduled_days?: number | null
          stability?: number | null
          state: number
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          due?: string | null
          duration_ms?: number
          elapsed_days?: number | null
          id?: number
          last_elapsed_days?: number | null
          question_id?: string
          rating?: number
          review?: string
          scheduled_days?: number | null
          stability?: number | null
          state?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_review_logs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_similar_questions: {
        Args: { match_count?: number; p_question_id: string }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      increment_library_download: { Args: { p_id: string }; Returns: undefined }
      increment_library_view: { Args: { p_id: string }; Returns: undefined }
      increment_post_view: { Args: { p_post_id: string }; Returns: undefined }
      increment_site_views: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      match_geometry_phash: {
        Args: { max_distance?: number; query_phash: number | string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          inline_svg: string | null
          labels: Json
          overpic_latex: string | null
          phash: number | null
          pipeline: string
          svg: string | null
          tikz: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "geometry_figures"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_questions: {
        Args: {
          match_count?: number
          query_embedding: string | number[]
          similarity_threshold?: number
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      paper_question_counts: {
        Args: never
        Returns: {
          paper_id: string
          question_count: number
        }[]
      }
      report_library_item: { Args: { p_id: string }; Returns: Json }
      search_post_ids: {
        Args: { lim?: number; q: string }
        Returns: {
          id: string
        }[]
      }
      search_question_ids: {
        Args: { lim?: number; q: string }
        Returns: {
          id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_fsrs_review: {
        Args: {
          p_card: Json
          p_duration_ms: number
          p_log: Json
          p_question_id: string
          p_rating: number
        }
        Returns: Json
      }
      toggle_comment_vote: {
        Args: { p_comment_id: string }
        Returns: {
          upvotes: number
          upvoted: boolean
        }[]
      }
      toggle_library_upvote: { Args: { p_id: string }; Returns: Json }
      toggle_post_vote: {
        Args: { p_post_id: string }
        Returns: {
          upvotes: number
          upvoted: boolean
        }[]
      }
    }
    Enums: {
      question_status: "draft" | "published" | "archived"
      question_type:
        | "multiple_choice"
        | "fill_in_blank"
        | "calculation"
        | "proof"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      question_status: ["draft", "published", "archived"],
      question_type: [
        "multiple_choice",
        "fill_in_blank",
        "calculation",
        "proof",
      ],
    },
  },
} as const
