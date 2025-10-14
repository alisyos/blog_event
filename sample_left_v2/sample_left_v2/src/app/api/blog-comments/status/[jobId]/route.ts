import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';

/**
 * GET /api/blog-comments/status/[jobId]
 * 작업 진행 상황 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const { jobId } = resolvedParams;

    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 클라이언트에 반환할 정보
    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        blogUrl: job.blogUrl,
        status: job.status,
        progress: job.progress,
        totalComments: job.totalComments,
        collectedComments: job.collectedComments,
        currentPage: job.currentPage,
        totalPages: job.totalPages,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });

  } catch (error) {
    console.error('작업 상태 조회 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '작업 상태 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
