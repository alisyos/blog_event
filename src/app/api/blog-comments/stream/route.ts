import { NextRequest } from 'next/server';
import { scrapeNaverBlogCommentsStreaming } from '@/lib/puppeteer-streaming';

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
 * POST /api/blog-comments/stream
 * 스트리밍 방식 댓글 수집 (타임아웃 없음)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blogUrl } = body;

    if (!blogUrl) {
      return new Response(
        JSON.stringify({ error: '블로그 URL을 입력해주세요' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // URL 파싱
    const parsed = parseBlogUrl(blogUrl);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: '올바른 네이버 블로그 URL 형식이 아닙니다' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encoder = new TextEncoder();

    // ReadableStream 생성
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log(`스트리밍 수집 시작: ${parsed.blogId}/${parsed.logNo}`);

          // 시작 메시지 전송
          const startMessage = JSON.stringify({
            type: 'start',
            message: '댓글 수집을 시작합니다...',
          }) + '\n';
          controller.enqueue(encoder.encode(startMessage));

          let totalComments = 0;

          // 페이지별 콜백 함수
          const onPageCollected = (pageData: {
            pageNumber: number;
            comments: any[];
            totalPages: number;
            isLastPage: boolean;
          }) => {
            totalComments += pageData.comments.length;

            const progress = pageData.totalPages > 0
              ? Math.round((pageData.totalPages - pageData.pageNumber + 1) / pageData.totalPages * 100)
              : 0;

            const chunk = JSON.stringify({
              type: 'page',
              page: pageData.pageNumber,
              comments: pageData.comments,
              totalComments,
              totalPages: pageData.totalPages,
              progress,
              isLastPage: pageData.isLastPage,
            }) + '\n';

            controller.enqueue(encoder.encode(chunk));
            console.log(`페이지 ${pageData.pageNumber} 전송 완료 (${pageData.comments.length}개 댓글)`);
          };

          // 스트리밍 크롤링 시작
          const result = await scrapeNaverBlogCommentsStreaming(
            parsed.blogId,
            parsed.logNo,
            onPageCollected
          );

          // 완료 메시지 전송
          const completeMessage = JSON.stringify({
            type: 'complete',
            total: result.total,
            message: `총 ${result.total}개의 댓글을 수집했습니다.`,
          }) + '\n';
          controller.enqueue(encoder.encode(completeMessage));

          console.log(`스트리밍 수집 완료: ${result.total}개 댓글`);
          controller.close();

        } catch (error) {
          console.error('스트리밍 수집 오류:', error);

          const errorMessage = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다',
          }) + '\n';
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      },
    });

    // 스트리밍 응답 반환
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Nginx 버퍼링 비활성화
      },
    });

  } catch (error) {
    console.error('스트리밍 API 오류:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro: 최대 5분 (스트리밍 시 적용 안 됨)
