import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';

/**
 * GET /api/blog-comments/download/[jobId]
 * CSV 파일 다운로드
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

    if (job.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: '작업이 아직 완료되지 않았습니다' },
        { status: 400 }
      );
    }

    if (!job.csvData) {
      return NextResponse.json(
        { success: false, error: 'CSV 데이터를 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // CSV 파일 다운로드 응답
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `naver-blog-comments-${timestamp}.csv`;

    return new NextResponse(job.csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    console.error('CSV 다운로드 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'CSV 다운로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
