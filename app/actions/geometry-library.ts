'use server';

// 几何图库落库 + phash 近重复检索。依赖迁移 017_geometry_figures.sql（需手动 Run）。
// 写入走 service_role（admin client，绕过 RLS）。

import { createAdminClient } from '@/lib/supabase/admin';
import type { GeoLabel, ProcessResult } from '@/types/tikz';
import type { Json } from '@/types/supabase';

export interface SaveGeometryInput {
  pipeline: 'A' | 'B';
  svg?: string | null;
  labels: GeoLabel[];
  overpic_latex?: string | null;
  tikz?: string | null;
  inline_svg?: string | null;
  phash?: string | null;
}

export type SaveGeometryResult = { success: true; id: string } | { success: false; error: string };

export async function saveGeometryFigure(input: SaveGeometryInput): Promise<SaveGeometryResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('geometry_figures')
      .insert({
        pipeline: input.pipeline,
        svg: input.svg ?? null,
        labels: input.labels as unknown as Json,
        overpic_latex: input.overpic_latex ?? null,
        tikz: input.tikz ?? null,
        inline_svg: input.inline_svg ?? null,
        phash: input.phash ?? null, // 字符串 → Postgres 无损 cast 为 BIGINT
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SimilarFigure {
  id: string;
  pipeline: 'A' | 'B';
  inline_svg: string | null;
  created_at: string;
}

/** 按汉明距离找近重复（调迁移里的 match_geometry_phash RPC）。phash 为空则跳过。 */
export async function findSimilarFigures(
  phash: string | null | undefined,
  maxDistance = 5,
): Promise<SimilarFigure[]> {
  if (!phash) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('match_geometry_phash', {
      query_phash: phash,
      max_distance: maxDistance,
    });
    if (error) return [];
    return (data as SimilarFigure[]) ?? [];
  } catch {
    return [];
  }
}

/** 便捷封装：从前端 ProcessResult + 当前标签 + 烘焙后的内联 SVG 落库。 */
export async function saveFromResult(
  result: ProcessResult,
  labels: GeoLabel[],
  inlineSvg: string | null,
): Promise<SaveGeometryResult> {
  return saveGeometryFigure({
    pipeline: result.pipeline,
    svg: result.svg ?? null,
    labels,
    overpic_latex: result.overpic_latex ?? null,
    tikz: result.tikz ?? null,
    inline_svg: inlineSvg,
    phash: result.phash ?? null,
  });
}
