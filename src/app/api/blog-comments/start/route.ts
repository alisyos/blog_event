import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob, addComments, completeJob, failJob } from '@/lib/job-manager';
import { scrapeNaverBlogCommentsSimple } from '@/lib/puppeteer-simple';
import { convertCommentsToCSV } from '@/lib/csv-utils';

/**
 * 네이버 블로그 URL 파싱
 */
function parseBlogUrl(url: string): { blogId: string; logNo: string } | null {
  try {
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    const urlObj = new URL(normalizedUrl);

    if (urlObj.hostname === 'blog.naver.com') {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length >= 2) {
        return {
          blogId: pathParts[0],
          logNo: pathParts[1]
        };
      }
    }

    if (urlObj.hostname === 'm.blog.naver.com') {
      const blogId = urlObj.searchParams.get('blogId');
      const logNo = urlObj.searchParams.get('logNo');
      if (blogId && logNo) {
        return { blogId, logNo };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/blog-comments/start
 * 백그라운드 댓글 수집 작업 시작
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blogUrl } = body;

    if (!blogUrl) {
      return NextResponse.json(
        { success: false, error: '블로그 URL을 입력해주세요' },
        { status: 400 }
      );
    }

    // URL 파싱
    const parsed = parseBlogUrl(blogUrl);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: '올바른 네이버 블로그 URL 형식이 아닙니다' },
        { status: 400 }
      );
    }

    // 작업 생성
    const job = createJob(blogUrl);
    console.log(`새로운 작업 생성: ${job.id} - ${blogUrl}`);

    // 백그라운드에서 댓글 수집 시작 (비동기)
    processCommentsInBackground(job.id, parsed.blogId, parsed.logNo).catch((error) => {
      console.error(`작업 ${job.id} 백그라운드 처리 오류:`, error);
      failJob(job.id, error.message || '알 수 없는 오류가 발생했습니다');
    });

    // 즉시 응답 반환 (작업 ID)
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: '댓글 수집 작업이 시작되었습니다',
    });

  } catch (error) {
    console.error('작업 시작 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '작업 시작 중 오류가 발생했습니다'
      },
      { status: 500 }
    );
  }
}

/**
 * 백그라운드 댓글 수집 처리
 */
async function processCommentsInBackground(
  jobId: string,
  blogId: string,
  logNo: string
): Promise<void> {
  try {
    // 작업 시작
    updateJob(jobId, { status: 'processing', progress: 5 });

    console.log(`작업 ${jobId} 처리 시작: ${blogId}/${logNo}`);

    // 단순 버전으로 댓글 수집 (jobId 전달하여 실시간 업데이트)
    const result = await scrapeNaverBlogCommentsSimple(blogId, logNo, jobId);

    // 수집된 모든 댓글 추가
    addComments(jobId, result.comments);

    // 진행률 업데이트
    updateJob(jobId, {
      progress: 95,
      totalComments: result.total,
    });

    console.log(
      `작업 ${jobId}: ${result.comments.length}개 댓글 수집 완료`
    );

    // 작업 완료 - CSV 생성
    const job = updateJob(jobId, { progress: 98 });
    if (!job) {
      throw new Error('작업을 찾을 수 없습니다');
    }

    console.log(`작업 ${jobId}: CSV 생성 중... (총 ${job.comments.length}개 댓글)`);

    const csvData = convertCommentsToCSV(job.comments);

    // 작업 완료 처리
    completeJob(jobId, csvData);

    console.log(`작업 ${jobId} 완료: ${job.comments.length}개 댓글 수집`);

  } catch (error) {
    console.error(`작업 ${jobId} 처리 실패:`, error);
    failJob(
      jobId,
      error instanceof Error ? error.message : '댓글 수집 중 오류가 발생했습니다'
    );
  }
}

export const dynamic = 'force-dynamic';
