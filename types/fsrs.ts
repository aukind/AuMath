// FSRS 智能错题本 —— 数据结构契约
// 算法引擎：ts-fsrs（FSRS 标准参数）。记忆参数随错题逐条存于 user_errors，
// 每次复习评分写一条 user_review_logs 流水。详见 supabase/migrations/019_fsrs_integration.sql。
import type { QuestionWithTopics } from '@/types/database';

// ── FSRS 算法核心字段（持久化在 user_errors 上的一行记忆状态）──────────────
// 注意 due 在 DB 为 TIMESTAMPTZ，跨网络/前端统一用 ISO 字符串表示。
export interface FSRSItem {
  due: string;            // TIMESTAMPTZ：下次复习时刻（ISO）
  stability: number;      // 记忆稳定性 S
  difficulty: number;     // FSRS 记忆难度 D（约 1–10，区别于题目绝对难度 1–5）
  elapsed_days: number;   // 距上次复习过去的天数
  scheduled_days: number; // 本次安排的复习间隔天数
  reps: number;           // 历史复习总次数
  lapses: number;         // 遗忘（选 Again）次数
  state: 0 | 1 | 2 | 3;   // 0=New / 1=Learning / 2=Review / 3=Relearning
}

// 评分：1=完全忘记(Again) / 2=磕磕绊绊(Hard) / 3=顺利解出(Good) / 4=肌肉记忆(Easy)
export type ReviewRating = 1 | 2 | 3 | 4;

// ── 提交评价的入参 ──────────────────────────────────────────────────────────
export interface ReviewActionPayload {
  questionId: string;
  rating: ReviewRating;
  durationMs: number; // 用户在这道题上停留/演算的时长
}

// 提交评价后的返回：下次到期时刻（ISO）
export interface ReviewResult {
  success: boolean;
  nextDue: string;
}

// 今日复习队列里的一道题（复用题库带分类的题目类型）
export type DueQuestion = QuestionWithTopics;

// ── Server Actions 契约（app/actions/fsrs.ts）──────────────────────────────
export interface FSRSActions {
  getTodayDueQuestions(): Promise<DueQuestion[]>;
  getTodayDueCount(): Promise<number>;
  submitReviewAction(payload: ReviewActionPayload): Promise<ReviewResult>;
}
