import { getBrowser } from './puppeteer';
import { BlogComment } from '@/types/blog-comment';

export interface ScrapePaginatedResult {
  comments: BlogComment[];
  totalEstimated: number;
  hasMore: boolean;
}

/**
 * 네이버 블로그 댓글 페이지네이션 크롤링
 * @param blogId 블로그 ID
 * @param logNo 게시글 번호
 * @param page 페이지 번호 (0부터 시작)
 * @param pageSize 페이지당 댓글 수
 */
export async function scrapeNaverBlogCommentsPaginated(
  blogId: string,
  logNo: string,
  page: number = 0,
  pageSize: number = 50
): Promise<ScrapePaginatedResult> {
  const browser = await getBrowser();
  const browserPage = await browser.newPage();

  // 브라우저 콘솔 로그를 서버 콘솔로 전달
  browserPage.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[프레임 내부]') || text.includes('[페이지네이션]')) {
      console.log(text);
    }
  });

  try {
    // User Agent 설정
    await browserPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 블로그 포스트 페이지 접속
    const url = `https://blog.naver.com/${blogId}/${logNo}`;
    console.log(`페이지 ${page + 1} 크롤링 시작:`, url);

    await browserPage.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // iframe으로 전환 - 먼저 본문 iframe 찾기
    await new Promise((resolve) => setTimeout(resolve, 3000));

    let frames = browserPage.frames();
    const mainFrame = frames.find(
      (frame) =>
        frame.url().includes('PostView.naver') ||
        frame.url().includes('PostView.nhn')
    );

    if (!mainFrame) {
      throw new Error('메인 프레임을 찾을 수 없습니다');
    }

    console.log('메인 프레임 발견:', mainFrame.url());

    // 최상위 프레임에서 먼저 스크롤 시도 (댓글 로드 유도)
    console.log('최상위 프레임에서 스크롤 시작...');
    await browserPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 메인 프레임(PostView)에서도 스크롤 (댓글 iframe 로드 유도)
    console.log('메인 프레임에서 스크롤 시작...');
    await mainFrame.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    console.log('스크롤 완료, 댓글 iframe 로딩 대기 중...');
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 3초 -> 5초로 증가

    // 댓글 iframe이 로드될 때까지 대기 (최대 10초)
    let commentFrame = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      frames = browserPage.frames();
      console.log(`=== iframe 탐지 시도 ${attempt + 1}/5 ===`);

      // 모든 프레임 URL 로깅 (첫 시도에만)
      if (attempt === 0) {
        frames.forEach((frame, index) => {
          console.log(`프레임 ${index}: ${frame.url()}`);
        });
      }

      // 댓글 iframe 찾기
      commentFrame = frames.find((frame) => {
        const url = frame.url().toLowerCase();
        return url.includes('commentbox') ||
               url.includes('comment') ||
               url.includes('cbox') ||
               url.includes('widgetcallback');
      });

      if (commentFrame) {
        console.log(`✓ 댓글 iframe 발견 (시도 ${attempt + 1}):`, commentFrame.url());
        break;
      }

      console.log(`댓글 iframe 없음, 2초 후 재시도...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 댓글 프레임 결정: 댓글 iframe → 최상위 프레임 → 메인 프레임 순서
    let workingFrame = commentFrame || browserPage.mainFrame();

    if (commentFrame) {
      console.log('✓ 댓글 전용 iframe 발견:', commentFrame.url());
    } else {
      console.log('✗ 댓글 전용 iframe 없음, 최상위 프레임에서 댓글 찾기');
      console.log('최상위 프레임 URL:', browserPage.mainFrame().url());

      // 최상위 프레임에서 cbox 요소 확인
      const hasCommentInMainFrame = await browserPage.mainFrame().evaluate(() => {
        const cboxCount = document.querySelectorAll('[class*="cbox"], [id*="cbox"]').length;
        return cboxCount > 0;
      });

      console.log('최상위 프레임에 cbox 요소 존재:', hasCommentInMainFrame);

      // 최상위 프레임의 HTML 일부 확인 (디버깅)
      const htmlSample = await browserPage.mainFrame().evaluate(() => {
        const html = document.body.innerHTML;
        // "댓글" 키워드 주변 텍스트 추출
        const idx = html.indexOf('댓글');
        if (idx > -1) {
          return html.substring(Math.max(0, idx - 200), Math.min(html.length, idx + 200));
        }
        return 'HTML에서 "댓글" 텍스트를 찾을 수 없음';
      });
      console.log('최상위 프레임 HTML 샘플:', htmlSample.substring(0, 500));

      // 최상위에도 없으면 PostView iframe 시도
      if (!hasCommentInMainFrame) {
        console.log('최상위 프레임에도 없음, PostView iframe 시도');
        workingFrame = mainFrame;
      }
    }

    // 추가 대기
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 스크린샷 저장 (디버깅용)
    try {
      await browserPage.screenshot({ path: 'debug-screenshot.png', fullPage: true });
      console.log('스크린샷 저장됨: debug-screenshot.png');
    } catch (e) {
      console.log('스크린샷 저장 실패:', e);
    }

    // 모든 댓글 로드 - 페이지 번호 클릭 방식
    console.log(`모든 댓글 페이지 로드 시작, workingFrame URL:`, workingFrame.url());

    let allComments: any[] = [];
    let currentPageNum = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        console.log(`${currentPageNum} 페이지 댓글 수집 중...`);

        // 현재 페이지 댓글 수집
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 페이지 HTML 구조 확인 (디버깅용)
        const debugInfo = await workingFrame.evaluate(() => {
          const info = {
            hasCommentText: document.body.innerText.includes('댓글'),
            cboxElements: document.querySelectorAll('[class*="cbox"], [id*="cbox"]').length,
            bodyLength: document.body.innerText.length,
          };
          return info;
        });
        console.log('디버그 정보:', debugInfo);

        const pageComments = await workingFrame.evaluate(() => {
          const results: any[] = [];

          // 먼저 페이지에 어떤 요소들이 있는지 확인
          const bodyText = document.body.innerText;
          const hasCommentText = bodyText.includes('댓글') || bodyText.includes('comment');
          console.log('[프레임 내부] 페이지에 "댓글" 텍스트 포함 여부:', hasCommentText);

          // 다양한 댓글 컨테이너 패턴 시도
          const commentContainers = [
            '#cbox_module',
            '.u_cbox',
            '.u_cbox_content_wrap',
            '.u_cbox_list',
            '#comment-box',
            '.comment_box',
            '[id*="cbox"]',
            '[class*="cbox"]',
          ];

          console.log('[프레임 내부] 댓글 컨테이너 찾기 시작...');

          let commentArea: Element | null = null;
          for (const selector of commentContainers) {
            try {
              const area = document.querySelector(selector);
              console.log(`[프레임 내부] ${selector} 검색: ${area ? '발견 ✓' : '없음 ✗'}`);
              if (area) {
                commentArea = area;
                console.log(`[프레임 내부] 선택된 댓글 영역 - ID: ${area.id}, Class: ${area.className}`);
                break;
              }
            } catch (e) {
              console.log(`[프레임 내부] ${selector} 검색 오류:`, e);
            }
          }

          // 댓글 영역을 못 찾으면 전체 페이지에서 댓글 관련 요소 검색
          if (!commentArea) {
            console.log('[프레임 내부] 특정 컨테이너를 찾을 수 없어 document.body에서 직접 검색');

            // body에서 직접 찾기
            const allElementsWithCbox = document.querySelectorAll('[class*="cbox"], [id*="cbox"]');
            console.log(`[프레임 내부] cbox 관련 요소 개수: ${allElementsWithCbox.length}`);

            if (allElementsWithCbox.length > 0) {
              allElementsWithCbox.forEach((el, idx) => {
                console.log(`[프레임 내부] cbox 요소 ${idx}: ID=${el.id}, Class=${el.className}`);
              });
            }

            return results;
          }

          console.log('[프레임 내부] 댓글 영역 발견, 댓글 요소 검색 시작...');

          // 더 넓은 범위의 댓글 요소 셀렉터
          const commentSelectors = [
            '.u_cbox_comment_box',
            '.u_cbox_list > li',
            '.u_cbox_comment',
            '[class*="comment_item"]',
            '[class*="cbox_comment"]',
            'li[class*="comment"]',
          ];

          let commentElements: NodeListOf<Element> | null = null;
          for (const selector of commentSelectors) {
            try {
              const elements = commentArea.querySelectorAll(selector);
              console.log(`[프레임 내부] ${selector} 댓글 요소: ${elements.length}개`);
              if (elements.length > 0) {
                commentElements = elements;
                break;
              }
            } catch (e) {
              console.log(`[프레임 내부] ${selector} 검색 오류:`, e);
            }
          }

          if (!commentElements || commentElements.length === 0) {
            console.log('[프레임 내부] 댓글 요소를 찾을 수 없음');
            return results;
          }

          console.log(`[프레임 내부] 최종 댓글 요소 개수: ${commentElements.length}`);

          commentElements.forEach((element, idx) => {
            try {
              const allText = element.textContent?.trim() || '';
              if (!allText || allText.length < 2) return;

              // 닉네임
              let nickname = '';
              const nicknameSelectors = [
                '.comment_nickname', '.nickname', '.nick', '.name', '.u_cbox_nick',
                '[class*="nickname"]', '[class*="nick"]', '[class*="name"]'
              ];
              for (const sel of nicknameSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  nickname = el.textContent.trim();
                  break;
                }
              }

              // 날짜
              let createdAt = '';
              const dateSelectors = [
                '.comment_time', '.date', '.time', '.u_cbox_date',
                '[class*="date"]', '[class*="time"]'
              ];
              for (const sel of dateSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  createdAt = el.textContent.trim();
                  break;
                }
              }

              // 댓글 내용
              let content = '';
              const contentSelectors = [
                '.comment_text', '.text_comment', '.comment_content', '.u_cbox_contents',
                '[class*="comment_text"]', '[class*="text"]', '[class*="contents"]'
              ];
              for (const sel of contentSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  content = el.textContent.trim();
                  break;
                }
              }

              if (!content && allText.length > 10) {
                content = allText;
              }

              // 작성자 URL
              const authorLink = element.querySelector('a[href*="blog.naver.com"]');
              const authorUrl = authorLink?.getAttribute('href') || '';

              // 공감수
              let likes = 0;
              const likeEl = element.querySelector('[class*="like"], [class*="sympathy"], .u_cnt');
              if (likeEl) {
                const likeText = likeEl.textContent?.trim() || '0';
                likes = parseInt(likeText.replace(/\D/g, '')) || 0;
              }

              // 답글수
              let replyCount = 0;
              const replyEl = element.querySelector('[class*="reply"]');
              if (replyEl) {
                const replyText = replyEl.textContent?.trim() || '0';
                replyCount = parseInt(replyText.replace(/\D/g, '')) || 0;
              }

              // 이미지
              const imageEl = element.querySelector('img[src*="phinf"], img[src*="blogfiles"]');
              const imageUrl = imageEl?.getAttribute('src') || '';

              // 링크 개수
              const links = (content.match(/https?:\/\/[^\s]+/g) || []).length;

              if (content && content.length > 0) {
                results.push({
                  nickname: nickname || '익명',
                  createdAt: createdAt || '',
                  content,
                  authorUrl,
                  likes,
                  replyCount,
                  imageUrl,
                  links,
                });
              }
            } catch (e) {
              console.error('댓글 추출 오류:', e);
            }
          });

          return results;
        });

        allComments.push(...pageComments);
        console.log(`${currentPageNum} 페이지: ${pageComments.length}개 댓글 수집 (누적: ${allComments.length}개)`);

        // 이전 페이지 버튼 클릭 (네이버는 마지막 페이지부터 시작하므로 역순)
        const prevPageClicked = await workingFrame.evaluate(() => {
          // 스크롤을 댓글 영역으로
          const commentArea = document.querySelector('#cbox_module, .u_cbox, .u_cbox_content_wrap');
          if (commentArea) {
            commentArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }

          // 페이지네이션 영역 찾기
          const paginationSelectors = [
            '.u_cbox_paginate',
            '.u_cbox_page_no',
            '[class*="paginate"]',
            '[class*="pagination"]',
          ];

          let pagination: Element | null = null;
          for (const selector of paginationSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              pagination = el;
              break;
            }
          }

          if (!pagination) {
            console.log('[페이지네이션] 페이지네이션 영역을 찾을 수 없음');
            return false;
          }

          // 현재 페이지 확인
          const currentPage = pagination.querySelector('.u_cbox_on, .on, .active');
          const currentNum = currentPage ? parseInt(currentPage.textContent?.trim() || '1') : 1;
          console.log(`[페이지네이션] 현재 페이지: ${currentNum}`);

          // 1페이지면 종료 (더 이상 이전 페이지 없음)
          if (currentNum === 1) {
            console.log('[페이지네이션] 1페이지 도달, 수집 완료');
            return false;
          }

          // "이전" 버튼 찾기
          const prevButtonSelectors = [
            '.u_cbox_prev',
            '.u_cbox_btn_prev',
            '[class*="prev"]',
            'a[title="이전"]',
          ];

          for (const selector of prevButtonSelectors) {
            const btn = pagination.querySelector(selector);
            if (btn && (btn as HTMLElement).offsetParent !== null) {
              const isDisabled = (btn as HTMLElement).classList.contains('u_cbox_disable') ||
                                 (btn as HTMLElement).classList.contains('disabled');

              if (!isDisabled) {
                console.log(`[페이지네이션] "이전" 버튼 클릭: ${selector}`);
                (btn as HTMLElement).click();
                return true;
              } else {
                console.log('[페이지네이션] "이전" 버튼이 비활성화됨');
                return false;
              }
            }
          }

          // 페이지 번호 링크 찾기 (현재 페이지 - 1)
          const pageLinks = Array.from(pagination.querySelectorAll('a[class*="page"], a[data-page]'));
          const prevPageLink = pageLinks.find(link => {
            const pageNum = parseInt(link.textContent?.trim() || '0');
            return pageNum === currentNum - 1;
          });

          if (prevPageLink && (prevPageLink as HTMLElement).offsetParent !== null) {
            console.log(`[페이지네이션] 페이지 ${currentNum - 1} 링크 클릭`);
            (prevPageLink as HTMLElement).click();
            return true;
          }

          console.log('[페이지네이션] 이전 페이지를 찾을 수 없음');
          return false;
        });

        if (!prevPageClicked) {
          console.log('더 이상 이전 페이지가 없음 (1페이지 도달 또는 버튼 없음)');
          hasNextPage = false;
          break;
        }

        currentPageNum++;

        // 페이지 로딩 대기 (네이버 서버 부하 방지)
        await new Promise((resolve) => setTimeout(resolve, 2500));

      } catch (e) {
        console.log(`페이지 ${currentPageNum} 처리 중 오류:`, e);
        hasNextPage = false;
        break;
      }
    }

    console.log(`모든 페이지 로드 완료: 총 ${allComments.length}개 댓글 수집 (${currentPageNum} 페이지)`);

    // 수집된 모든 댓글을 BlogComment 형식으로 변환
    const result = {
      comments: allComments,
      total: allComments.length
    };

    console.log(`페이지 ${page + 1}: ${result.comments.length}개 댓글 반환`);

    return {
      comments: result.comments,
      totalEstimated: result.total,
      hasMore: false, // 이미 모든 페이지를 수집했으므로 false
    };

  } catch (error) {
    console.error(`페이지 ${page + 1} 크롤링 오류:`, error);
    throw error;
  } finally {
    await browserPage.close();
  }
}
