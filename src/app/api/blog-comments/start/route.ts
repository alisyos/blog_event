import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob, addComments, completeJob, failJob } from '@/lib/job-manager';
import { scrapeNaverBlogCommentsSimple, ScrapeResult } from '@/lib/puppeteer-simple';
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
 * 동기 방식 댓글 수집 (Vercel Pro 60초 타임아웃)
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

    try {
      // 동기 방식으로 댓글 수집 (60초 안에 완료)
      updateJob(job.id, { status: 'processing', progress: 5 });

      console.log(`작업 ${job.id} 처리 시작: ${parsed.blogId}/${parsed.logNo}`);

      // 타임아웃 제한: 50초 (여유 시간 확보)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('수집 시간이 초과되었습니다 (50초)')), 50000);
      });

      const scrapePromise = scrapeNaverBlogCommentsSimple(parsed.blogId, parsed.logNo, job.id);

      const result = await Promise.race([scrapePromise, timeoutPromise]) as ScrapeResult;

      // 수집된 댓글 추가
      addComments(job.id, result.comments);

      // 진행률 업데이트
      updateJob(job.id, {
        progress: 95,
        totalComments: result.total,
      });

      console.log(`작업 ${job.id}: ${result.comments.length}개 댓글 수집 완료`);

      // CSV 생성
      const jobData = updateJob(job.id, { progress: 98 });
      if (!jobData) {
        throw new Error('작업을 찾을 수 없습니다');
      }

      const csvData = convertCommentsToCSV(jobData.comments);

      // 작업 완료
      completeJob(job.id, csvData);

      console.log(`작업 ${job.id} 완료: ${jobData.comments.length}개 댓글 수집`);

      // 완료된 작업 정보 반환
      return NextResponse.json({
        success: true,
        jobId: job.id,
        status: 'completed',
        totalComments: jobData.comments.length,
        message: '댓글 수집이 완료되었습니다',
      });

    } catch (error) {
      console.error(`작업 ${job.id} 처리 실패:`, error);
      failJob(
        job.id,
        error instanceof Error ? error.message : '댓글 수집 중 오류가 발생했습니다'
      );

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '댓글 수집 중 오류가 발생했습니다',
        },
        { status: 500 }
      );
    }

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

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: 최대 60초
