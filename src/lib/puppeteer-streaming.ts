import { getBrowser } from './puppeteer';
import { BlogComment } from '@/types/blog-comment';

export interface ScrapeResult {
  comments: BlogComment[];
  total: number;
}

export interface PageCallback {
  (data: {
    pageNumber: number;
    comments: BlogComment[];
    totalPages: number;
    isLastPage: boolean;
  }): void;
}

/**
 * 네이버 블로그 댓글 크롤링 (스트리밍 버전)
 * 페이지별로 데이터를 콜백으로 전송
 */
export async function scrapeNaverBlogCommentsStreaming(
  blogId: string,
  logNo: string,
  onPageCollected: PageCallback
): Promise<ScrapeResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // 브라우저 콘솔 로그를 서버 콘솔로 전달
  page.on('console', (msg) => {
    console.log('[Browser]', msg.text());
  });

  try {
    // User Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://blog.naver.com/${blogId}/${logNo}`;
    console.log('페이지 접속:', url);

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    console.log('페이지 로드 완료, 2초 대기...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 댓글 버튼 클릭 로직 (기존과 동일)
    const frames = page.frames();
    let buttonClicked = false;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.url() === 'about:blank' || frame.url() === '') continue;

      try {
        const clicked = await frame.evaluate(() => {
          // #commentCount 기반 검색
          const commentCountElements = Array.from(document.querySelectorAll('#commentCount, ._commentCount'));

          if (commentCountElements.length > 0) {
            for (const countEl of commentCountElements) {
              let parent = countEl.parentElement;
              let depth = 0;

              while (parent && depth < 5) {
                if (parent.tagName === 'A' || parent.tagName === 'BUTTON' ||
                    (parent as HTMLElement).onclick !== null ||
                    parent.getAttribute('role') === 'button') {
                  if ((parent as HTMLElement).offsetParent !== null) {
                    (parent as HTMLElement).click();
                    return true;
                  }
                }
                parent = parent.parentElement;
                depth++;
              }
            }
          }

          // 패턴 기반 검색
          const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
          const candidates: Array<{ element: Element; text: string; score: number }> = [];

          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            if (!text.includes('댓글') || text.length > 20) continue;
            if (text.includes('#') || text.includes('작성') || text.includes('인증')) continue;
            if ((el as HTMLElement).offsetParent === null) continue;

            let score = 0;
            if (text === '댓글') score += 100;
            if (/^댓글\s*\d+$/.test(text)) score += 90;
            if (el.querySelector('#commentCount, ._commentCount')) score += 150;
            if (el.tagName === 'BUTTON' || el.tagName === 'A') score += 30;

            candidates.push({ element: el, text, score });
          }

          candidates.sort((a, b) => b.score - a.score);

          if (candidates.length > 0) {
            (candidates[0].element as HTMLElement).click();
            return true;
          }

          return false;
        });

        if (clicked) {
          console.log(`✓ 프레임 ${i}에서 "댓글" 버튼 클릭 성공!`);
          buttonClicked = true;
          break;
        }
      } catch (e) {
        // 무시
      }
    }

    if (buttonClicked) {
      console.log('댓글 로딩 대기 중 (3초)...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 댓글 프레임 찾기
    const allFrames = page.frames();
    let commentFrame = allFrames.find(f => f.url().includes('PostView.naver'));

    if (!commentFrame) {
      commentFrame = allFrames.find(f => f.url().includes(`logNo=${logNo}`));
    }

    if (!commentFrame) {
      commentFrame = allFrames.find(f =>
        (f.url().includes('CommentBox') ||
         f.url().includes('comment') ||
         (f.url().includes('blogId=') && f.url().includes(blogId))) &&
        !f.url().includes('PostListByTagName')
      );
    }

    if (!commentFrame) {
      commentFrame = page.mainFrame();
    }

    console.log(`댓글 프레임 선택: ${commentFrame.url()}`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 마지막 페이지 번호 감지
    const lastPageNumber = await commentFrame.evaluate(() => {
      const pagination = document.querySelector('.u_cbox_paginate');
      if (!pagination) return 1;

      const activePageElement = pagination.querySelector('.u_cbox_page_current, .u_cbox_num_page.on, strong, em');
      if (activePageElement) {
        const pageNum = parseInt(activePageElement.textContent?.trim() || '0');
        if (!isNaN(pageNum) && pageNum > 0) return pageNum;
      }

      const pageElements = Array.from(pagination.querySelectorAll('a, span, strong, em'));
      const pageNumbers = pageElements
        .map(el => parseInt(el.textContent?.trim() || '0'))
        .filter(num => !isNaN(num) && num > 0);

      if (pageNumbers.length > 0) {
        return Math.max(...pageNumbers);
      }

      return 1;
    });

    let currentPageNumber = lastPageNumber;
    console.log(`\n=== 스트리밍 수집 시작 ===`);
    console.log(`마지막 페이지 번호: ${lastPageNumber}`);

    let allComments: BlogComment[] = [];
    let pageCount = 1;
    const maxPages = 100;

    // 페이지 순회
    while (pageCount <= maxPages && currentPageNumber >= 1) {
      console.log(`\n=== 페이지 ${pageCount} (번호: ${currentPageNumber}) 수집 시작 ===`);

      try {
        await commentFrame.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        }).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 800));

        // 댓글 수집 (개선된 로직)
        const comments = await commentFrame.evaluate(() => {
          const results: any[] = [];
          const commentContainers = ['#cbox_module', '.u_cbox', 'div[id*="comment"]'];

          let commentArea: Element | null = null;
          for (const sel of commentContainers) {
            const el = document.querySelector(sel);
            if (el) {
              commentArea = el;
              break;
            }
          }

          if (!commentArea) commentArea = document.body;

          // 댓글 리스트 컨테이너 찾기
          const listContainers = ['.u_cbox_list', '.u_cbox_comment_list'];
          let listContainer: Element | null = null;

          for (const sel of listContainers) {
            const el = commentArea.querySelector(sel);
            if (el) {
              listContainer = el;
              console.log(`[DEBUG] 댓글 리스트 컨테이너 발견: ${sel}`);
              break;
            }
          }

          if (!listContainer) listContainer = commentArea;

          // 댓글 박스 요소 찾기 (모든 .u_cbox_comment_box)
          const allCommentBoxes = Array.from(listContainer.querySelectorAll('.u_cbox_comment_box'));
          console.log(`[DEBUG] 발견된 전체 댓글 박스: ${allCommentBoxes.length}개`);

          allCommentBoxes.forEach((element, index) => {
            try {
              const text = element.textContent?.trim() || '';
              if (text.length < 5) return;

              // u_cbox_reply_area 내부에 있는지 확인하여 댓글/답글 구분
              let commentType = '댓글';

              const isInReplyArea = element.closest('.u_cbox_reply_area') !== null;
              if (isInReplyArea) {
                commentType = '답글';
              }

              console.log(`[DEBUG] 요소 ${index}: ${commentType} - isInReplyArea: ${isInReplyArea}`);

              let nickname = '익명';
              let authorUrl = '';
              const nickSelectors = ['.u_cbox_nick', '.nickname'];
              for (const sel of nickSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  nickname = el.textContent.trim();
                  const linkElement = el.querySelector('a') || el.closest('a');
                  if (linkElement) {
                    authorUrl = linkElement.getAttribute('href') || '';
                    if (authorUrl && !authorUrl.startsWith('http')) {
                      authorUrl = `https://blog.naver.com${authorUrl}`;
                    }
                  }
                  break;
                }
              }

              let createdAt = '';
              const dateEl = element.querySelector('.u_cbox_date, .date');
              if (dateEl) createdAt = dateEl.textContent?.trim() || '';

              let content = '';
              const contentTextArea = element.querySelector('.u_cbox_contents_inner, .u_cbox_text_wrap, .u_cbox_contents');
              if (contentTextArea) {
                const textNode = Array.from(contentTextArea.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE ||
                                 (node.nodeType === Node.ELEMENT_NODE &&
                                  !(node as Element).matches('.u_cbox_btn_recomm, .u_cbox_btn_reply, button')))
                  .map(node => node.textContent?.trim())
                  .filter(t => t && t.length > 0)
                  .join(' ');
                if (textNode) content = textNode;
              }

              if (!content) {
                const contentEl = element.querySelector('.u_cbox_contents, .comment_text');
                if (contentEl) content = contentEl.textContent?.trim() || '';
              }

              let likes = 0;
              const likeEl = element.querySelector('.u_cbox_cnt_recomm, .u_cbox_recomm_count');
              if (likeEl) {
                const likeText = likeEl.textContent?.trim() || '';
                if (likeText.includes('공감')) {
                  const match = likeText.match(/(\d+)/);
                  if (match) likes = parseInt(match[1]);
                }
              }

              if (likes > 0) {
                content = content.replace(/공감\s*\d+|\d+\s*공감/g, '').trim();
              }

              content = content.replace(/신고\s*답글|답글\s*신고|신고|답글/g, '').trim();

              // 이미지 URL 수집 (u_cbox_image_wrap 내부 이미지)
              let imageUrl = '';

              // u_cbox_image_wrap 내부의 이미지 찾기
              const imageWrap = element.querySelector('.u_cbox_image_wrap');
              if (imageWrap) {
                const imageEl = imageWrap.querySelector('img');
                if (imageEl) {
                  const src = imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || '';
                  if (src) {
                    imageUrl = src;
                    if (imageUrl && !imageUrl.startsWith('http')) {
                      imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : `https:${imageUrl}`;
                    }
                    console.log(`[DEBUG] 댓글 이미지 발견: ${imageUrl}`);
                  }
                }
              }

              // 링크수 계산 (댓글 내용 영역의 <a> 태그 개수)
              let linkCount = 0;
              if (contentTextArea) {
                const links = contentTextArea.querySelectorAll('a');
                linkCount = links.length;
                if (linkCount > 0) {
                  console.log(`[DEBUG] 댓글 내 링크 ${linkCount}개 발견`);
                }
              }

              // 답글수는 나중에 계산 (답글만 개수 센다)
              results.push({
                createdAt,
                commentType,
                nickname,
                authorUrl,
                likes,
                replyCount: 0, // 나중에 계산
                imageUrl,
                links: linkCount,
                content,
              });
            } catch (e) {
              console.error('[DEBUG] 댓글 파싱 오류:', e);
            }
          });

          console.log(`[DEBUG] 파싱 완료: ${results.length}개 댓글`);
          return results;
        });

        console.log(`페이지 ${currentPageNumber}: ${comments.length}개 댓글 수집`);
        allComments.push(...comments);

        // 현재까지 수집된 전체 댓글에 대해 답글수 계산
        for (let i = 0; i < allComments.length; i++) {
          const comment = allComments[i];
          if (comment.commentType === '댓글') {
            let replyCount = 0;
            for (let j = i + 1; j < allComments.length; j++) {
              if (allComments[j].commentType === '답글') {
                replyCount++;
              } else {
                break;
              }
            }
            comment.replyCount = replyCount;
          }
        }

        // 페이지별 콜백 호출 (답글수가 계산된 현재 페이지 댓글 전송)
        const isLastPage = currentPageNumber === 1 || pageCount >= maxPages;
        onPageCollected({
          pageNumber: currentPageNumber,
          comments, // 이미 allComments에 포함되어 답글수가 계산됨
          totalPages: lastPageNumber,
          isLastPage,
        });

        if (isLastPage) {
          console.log('마지막 페이지 수집 완료!');
          break;
        }

        // 다음 페이지로 이동
        const nextPageNumber = currentPageNumber - 1;

        // 1. 먼저 특정 페이지 번호 클릭 시도
        let pageClicked = await commentFrame.evaluate((targetPage) => {
          const pagination = document.querySelector('.u_cbox_paginate');
          if (!pagination) return false;

          const allElements = Array.from(pagination.querySelectorAll('a, button, span, div'));
          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            const pageNum = parseInt(text);
            if (pageNum === targetPage && (el as HTMLElement).offsetParent !== null) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, nextPageNumber);

        // 2. 페이지 번호가 없으면 "이전" 버튼 클릭
        if (!pageClicked) {
          pageClicked = await commentFrame.evaluate(() => {
            const pagination = document.querySelector('.u_cbox_paginate');
            if (!pagination) return false;

            // "이전" 버튼 찾기
            const allElements = Array.from(pagination.querySelectorAll('a, button'));
            for (const el of allElements) {
              const text = el.textContent?.trim() || '';
              const ariaLabel = el.getAttribute('aria-label') || '';

              // "이전", "<", "prev" 등의 텍스트나 속성 확인
              if (text === '이전' || text === '<' ||
                  text.includes('이전') || text.includes('prev') ||
                  ariaLabel.includes('이전') || ariaLabel.includes('prev')) {
                if ((el as HTMLElement).offsetParent !== null) {
                  (el as HTMLElement).click();
                  return true;
                }
              }
            }

            // 클래스명으로 찾기
            const prevButton = pagination.querySelector('.u_cbox_btn_page_prev, .u_cbox_pre, .btn_prev');
            if (prevButton && (prevButton as HTMLElement).offsetParent !== null) {
              (prevButton as HTMLElement).click();
              return true;
            }

            return false;
          });
        }

        if (pageClicked) {
          console.log(`✓ 다음 페이지로 이동 성공! (목표: ${nextPageNumber})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('더 이상 페이지 없음. 수집 완료!');
          break;
        }

        currentPageNumber = nextPageNumber;
        pageCount++;

      } catch (e) {
        console.log(`페이지 ${currentPageNumber} 처리 오류:`, e);
        break;
      }
    }

    console.log(`\n=== 전체 수집 완료: 총 ${allComments.length}개 댓글 ===`);

    // 답글수 계산 (댓글 바로 다음에 연속으로 나오는 답글 개수)
    for (let i = 0; i < allComments.length; i++) {
      const comment = allComments[i];
      if (comment.commentType === '댓글') {
        // 이 댓글 바로 다음부터 연속된 답글 개수 세기
        let replyCount = 0;
        for (let j = i + 1; j < allComments.length; j++) {
          if (allComments[j].commentType === '답글') {
            replyCount++;
          } else {
            // 답글이 아닌 것(다음 댓글)을 만나면 중단
            break;
          }
        }
        comment.replyCount = replyCount;
        console.log(`[DEBUG] 댓글 "${comment.nickname}"의 답글수: ${replyCount}개`);
      }
    }

    // 디버그: 댓글/답글 통계 출력
    const commentCount = allComments.filter(c => c.commentType === '댓글').length;
    const replyCount = allComments.filter(c => c.commentType === '답글').length;
    console.log(`댓글: ${commentCount}개, 답글: ${replyCount}개`);

    return {
      comments: allComments,
      total: allComments.length
    };

  } catch (error) {
    console.error('크롤링 오류:', error);
    throw error;
  } finally {
    await page.close();
  }
}
