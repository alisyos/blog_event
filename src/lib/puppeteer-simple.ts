import { getBrowser } from './puppeteer';
import { BlogComment } from '@/types/blog-comment';
import { updateJob } from './job-manager';

export interface ScrapeResult {
  comments: BlogComment[];
  total: number;
}

/**
 * 네이버 블로그 댓글 크롤링 (단순 버전)
 */
export async function scrapeNaverBlogCommentsSimple(
  blogId: string,
  logNo: string,
  jobId?: string
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

    console.log('페이지 로드 완료, 3초 대기...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 현재 페이지 URL 확인 (리다이렉트 체크)
    const currentUrl = page.url();
    console.log(`현재 페이지 URL: ${currentUrl}`);
    if (!currentUrl.includes(logNo)) {
      console.log(`경고: 페이지가 리다이렉트되었거나 게시글 URL이 다릅니다. (예상: ${logNo})`);
    }

    // 모든 프레임에서 "댓글" 버튼 찾아서 클릭
    console.log('"댓글" 버튼 찾는 중...');
    const frames = page.frames();

    let buttonClicked = false;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.url() === 'about:blank' || frame.url() === '') continue;

      try {
        const clicked = await frame.evaluate(() => {
          // 방법 1: #commentCount 또는 ._commentCount를 포함하는 부모 요소 찾기
          console.log('\n=== 댓글 버튼 검색 (ID/Class 기반) ===');
          const commentCountElements = document.querySelectorAll('#commentCount, ._commentCount');

          if (commentCountElements.length > 0) {
            for (const countEl of commentCountElements) {
              // 부모 요소들을 순회하며 클릭 가능한 요소 찾기
              let parent = countEl.parentElement;
              let depth = 0;

              while (parent && depth < 5) {
                const text = parent.textContent?.trim() || '';
                console.log(`[부모 ${depth}] 태그: ${parent.tagName}, 텍스트: "${text.substring(0, 50)}"`);

                // 클릭 가능한 요소인지 확인 (a, button, 또는 클릭 이벤트가 있는 요소)
                if (parent.tagName === 'A' || parent.tagName === 'BUTTON' ||
                    (parent as HTMLElement).onclick !== null ||
                    parent.getAttribute('role') === 'button') {

                  if ((parent as HTMLElement).offsetParent !== null) {
                    console.log(`✓ 클릭 가능한 부모 요소 발견: ${parent.tagName}`);
                    (parent as HTMLElement).click();
                    return true;
                  }
                }

                parent = parent.parentElement;
                depth++;
              }
            }
          }

          // 방법 2: "댓글 숫자" 패턴 검색 (기존 방식)
          console.log('\n=== 댓글 버튼 검색 (패턴 기반) ===');
          const allElements = Array.from(document.querySelectorAll('button, a, div, span'));

          // 먼저 조건에 맞는 후보들을 필터링
          const candidates: Array<{ element: Element; text: string; score: number }> = [];

          for (const el of allElements) {
            const text = el.textContent?.trim() || '';

            // "댓글" 포함 체크
            if (!text.includes('댓글')) continue;

            // 길이 체크: 댓글 버튼은 보통 짧음 (20자로 제한)
            if (text.length > 20) {
              continue;
            }

            // 해시태그(#) 제외
            if (text.includes('#')) {
              continue;
            }

            // "작성", "인증", "참여" 등의 키워드가 포함되면 제외 (이벤트 안내 텍스트)
            if (text.includes('작성') || text.includes('인증') || text.includes('참여') ||
                text.includes('★') || text.includes('비밀') || text.includes('완료')) {
              continue;
            }

            // 동그라미 숫자 제외 (이벤트 번호)
            if (text.includes('③') || text.includes('②') || text.includes('①') ||
                text.includes('④') || text.includes('⑤')) {
              continue;
            }

            // 해시태그 링크가 아닌지 확인
            const href = (el as HTMLAnchorElement).href || '';
            if (href.includes('tagName=') || href.includes('tag=')) {
              continue;
            }

            // 클래스나 ID에 tag가 포함된 경우도 제외
            const className = el.className || '';
            const id = el.id || '';
            if (className.includes('tag') || id.includes('tag')) {
              continue;
            }

            // 클릭 가능한지 확인
            if ((el as HTMLElement).offsetParent === null) {
              continue;
            }

            // 이 시점에서 후보로 추가
            // 점수 매기기: 더 정확한 패턴에 높은 점수
            let score = 0;

            // 정확히 "댓글"만 있으면 가장 높은 점수
            if (text === '댓글') {
              score += 100;
            }

            // "댓글 숫자" 패턴이면 높은 점수
            if (/^댓글\s*\d+$/.test(text)) {
              score += 90;
            }

            // _commentCount 클래스가 자식에 있으면 매우 높은 점수
            if (el.querySelector('#commentCount, ._commentCount')) {
              score += 150;
            }

            // button 또는 a 태그면 가산점
            if (el.tagName === 'BUTTON' || el.tagName === 'A') {
              score += 30;
            }

            // 클래스에 comment 관련 키워드가 있으면 가산점
            if (className.includes('comment') || className.includes('cbox')) {
              score += 20;
            }

            // "공감" 버튼 근처에 있는지 확인 (같은 부모 아래)
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.querySelectorAll('*'));
              const hasLikeButton = siblings.some(sibling => {
                const siblingText = sibling.textContent?.trim() || '';
                return siblingText.includes('공감');
              });
              if (hasLikeButton) {
                score += 50; // 공감 버튼과 같은 레벨이면 큰 가산점
              }
            }

            console.log(`[후보] "${text}" (점수: ${score}, 태그: ${el.tagName})`);
            candidates.push({ element: el, text, score });
          }

          console.log(`\n총 ${candidates.length}개 후보 발견`);

          // 점수가 높은 순으로 정렬
          candidates.sort((a, b) => b.score - a.score);

          // 가장 점수가 높은 것을 클릭
          if (candidates.length > 0) {
            const best = candidates[0];
            console.log(`\n[최종 선택] "${best.text}" (점수: ${best.score})`);
            console.log('버튼 클릭 시도...');
            (best.element as HTMLElement).click();
            return true;
          }

          console.log('\n적합한 댓글 버튼을 찾지 못했습니다.');
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
      console.log('댓글 로딩 대기 중 (5초)...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('경고: "댓글" 버튼을 찾지 못했습니다. 스크롤로 시도...');
      // 스크롤로 시도
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('댓글 프레임 확인...');
    let allComments: any[] = [];

    // 모든 프레임 URL 로그 출력 (디버깅용)
    const allFrames = page.frames();
    console.log(`총 ${allFrames.length}개의 프레임 발견:`);
    allFrames.forEach((frame, index) => {
      console.log(`  프레임 ${index}: ${frame.url()}`);
    });

    // 댓글이 있는 프레임 찾기 (여러 패턴 시도)
    let commentFrame = allFrames.find(f => f.url().includes('PostView.naver'));

    if (!commentFrame) {
      // PostView.naver를 못 찾으면 logNo가 포함된 프레임 찾기
      commentFrame = allFrames.find(f => f.url().includes(`logNo=${logNo}`));
    }

    if (!commentFrame) {
      // 그래도 못 찾으면 다른 댓글 관련 패턴 시도 (단, PostListByTagName은 제외)
      commentFrame = allFrames.find(f =>
        (f.url().includes('CommentBox') ||
         f.url().includes('comment') ||
         (f.url().includes('blogId=') && f.url().includes(blogId))) &&
        !f.url().includes('PostListByTagName')
      );
    }

    if (!commentFrame) {
      // 여전히 못 찾으면 메인 프레임 사용
      console.log('경고: 댓글 전용 프레임을 찾을 수 없습니다. 메인 프레임에서 시도합니다.');
      commentFrame = page.mainFrame();
    }

    console.log(`댓글 프레임 선택: ${commentFrame.url()}`);

    // 페이지네이션이 나타날 때까지 대기 (최대 10초)
    console.log('페이지네이션 로딩 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 마지막 페이지 번호 감지 (역순 수집을 위해 마지막부터 시작)
    const lastPageNumber = await commentFrame.evaluate(() => {
      const pagination = document.querySelector('.u_cbox_paginate');

      if (!pagination) {
        console.log('페이지네이션을 찾을 수 없습니다.');

        // 페이지네이션이 없을 때: 현재 페이지의 활성 페이지 번호 찾기
        // 네이버 블로그는 페이지네이션 없이도 활성 페이지 번호가 표시될 수 있음
        const allElements = Array.from(document.querySelectorAll('strong, em, span, [class*="current"]'));
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          const pageNum = parseInt(text);
          if (!isNaN(pageNum) && pageNum > 0 && pageNum < 200) {
            console.log(`페이지네이션 없이 활성 페이지 감지: ${pageNum}`);
            return pageNum;
          }
        }

        console.log('페이지 번호를 전혀 찾을 수 없습니다. 1페이지로 시작합니다.');
        return 1;
      }

      // 방법 1: 현재 활성화된 페이지 찾기 (첫 로드 시 마지막 페이지가 활성화됨)
      const activePageElement = pagination.querySelector('.u_cbox_page_current, .u_cbox_num_page.on, strong, em');
      if (activePageElement) {
        const pageNum = parseInt(activePageElement.textContent?.trim() || '0');
        if (!isNaN(pageNum) && pageNum > 0) {
          console.log(`활성 페이지에서 감지: ${pageNum}`);
          return pageNum;
        }
      }

      // 방법 2: 모든 페이지 번호 요소를 찾아 가장 큰 번호 추출
      const pageElements = Array.from(pagination.querySelectorAll('a, span, strong, em'));
      const pageNumbers = pageElements
        .map(el => parseInt(el.textContent?.trim() || '0'))
        .filter(num => !isNaN(num) && num > 0);

      if (pageNumbers.length > 0) {
        const maxPage = Math.max(...pageNumbers);
        console.log(`모든 페이지 번호에서 최대값 감지: ${maxPage}`);
        return maxPage;
      }

      // 방법 3: 실패 시 1로 fallback (안전하게 첫 페이지부터)
      console.log('페이지 번호 감지 실패. 1페이지로 시작합니다.');
      return 1;
    });

    let currentPageNumber = lastPageNumber;
    console.log(`\n=== 수집 시작 ===`);
    console.log(`마지막 페이지 번호: ${lastPageNumber}`);
    console.log(`예상 최대 댓글 수: 약 ${lastPageNumber * 50}개`);

    // Job에 전체 페이지 수 업데이트
    if (jobId) {
      updateJob(jobId, {
        totalPages: lastPageNumber,
        totalComments: lastPageNumber * 50, // 예상 댓글 수
      });
    }

    // 페이지 순회하면서 댓글 수집
    let pageCount = 1;
    const maxPages = 100; // 최대 페이지 제한 (무한 루프 방지) - 최대 5,000개 댓글 수집 가능

    while (pageCount <= maxPages && currentPageNumber >= 1) {
      console.log(`\n=== 페이지 ${pageCount} (번호: ${currentPageNumber}) 수집 시작 ===`);

      // Job에 현재 페이지 업데이트
      if (jobId) {
        const progress = Math.min(90, (pageCount / Math.max(lastPageNumber, 1)) * 90);
        updateJob(jobId, {
          currentPage: currentPageNumber,
          progress: Math.round(progress),
          collectedComments: allComments.length,
        });
      }

      try {
        // 스크롤 시도
        await commentFrame.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        }).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 1000));

        // 댓글 수집
        const comments = await commentFrame.evaluate(() => {
          const results: any[] = [];

          // 네이버 블로그 댓글 컨테이너 찾기
          const commentContainers = [
            '#cbox_module',
            '.u_cbox',
            'div[id*="comment"]',
            'div[class*="comment"]'
          ];

          let commentArea: Element | null = null;
          for (const sel of commentContainers) {
            const el = document.querySelector(sel);
            if (el) {
              commentArea = el;
              break;
            }
          }

          if (!commentArea) {
            commentArea = document.body;
          }

          // 네이버 블로그 댓글 셀렉터
          const commentSelectors = [
            '.u_cbox_comment_box',
            '.u_cbox_list > li',
            'li[class*="comment"]'
          ];

          let commentElements: NodeListOf<Element> | null = null;
          for (const sel of commentSelectors) {
            const elements = commentArea.querySelectorAll(sel);
            if (elements.length > 0) {
              commentElements = elements;
              break;
            }
          }

          if (!commentElements || commentElements.length === 0) {
            return results;
          }

          commentElements.forEach((element) => {
            try {
              const text = element.textContent?.trim() || '';

              if (text.length < 5) {
                return;
              }

              // 댓글 타입 구분 (댓글/답글)
              let commentType = '댓글';
              // 답글은 보통 들여쓰기, 특정 클래스, 또는 부모 요소로 구분됨
              const isReply = element.classList.contains('u_cbox_reply') ||
                             element.classList.contains('reply') ||
                             element.closest('.u_cbox_reply') !== null ||
                             element.closest('[class*="reply"]') !== null ||
                             element.querySelector('.u_cbox_reply_depth') !== null ||
                             element.classList.contains('u_cbox_comment_box_reply') ||
                             (element.parentElement?.classList.contains('u_cbox_reply_list'));

              if (isReply) {
                commentType = '답글';
              }

              // 닉네임 및 작성자 URL 찾기
              let nickname = '익명';
              let authorUrl = '';
              const nickSelectors = ['.u_cbox_nick', '.nickname', '[class*="nick"]', '[class*="name"]'];
              for (const sel of nickSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  nickname = el.textContent.trim();

                  // 닉네임 요소 내부 또는 부모의 링크 찾기
                  const linkElement = el.querySelector('a') || el.closest('a') || el.parentElement?.querySelector('a');
                  if (linkElement) {
                    authorUrl = linkElement.getAttribute('href') || '';
                    // 상대 경로인 경우 절대 경로로 변환
                    if (authorUrl && !authorUrl.startsWith('http')) {
                      authorUrl = `https://blog.naver.com${authorUrl.startsWith('/') ? '' : '/'}${authorUrl}`;
                    }
                  }
                  break;
                }
              }

              // 날짜 찾기
              let createdAt = '';
              const dateSelectors = ['.u_cbox_date', '.date', '[class*="date"]', '[class*="time"]'];
              for (const sel of dateSelectors) {
                const el = element.querySelector(sel);
                if (el?.textContent?.trim()) {
                  createdAt = el.textContent.trim();
                  break;
                }
              }

              // 댓글 내용 찾기 - 더 정확한 셀렉터 사용
              let content = '';

              // 방법 1: 댓글 내용만 정확히 추출
              const contentTextArea = element.querySelector('.u_cbox_contents_inner, .u_cbox_text_wrap, .u_cbox_contents');
              if (contentTextArea) {
                // 텍스트 노드만 추출 (자식 요소 제외)
                const textNode = Array.from(contentTextArea.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE ||
                                 (node.nodeType === Node.ELEMENT_NODE &&
                                  !(node as Element).matches('.u_cbox_btn_recomm, .u_cbox_btn_reply, button, [class*="btn"]')))
                  .map(node => node.textContent?.trim())
                  .filter(text => text && text.length > 0)
                  .join(' ');

                if (textNode) {
                  content = textNode;
                }
              }

              // 방법 2: 여전히 비어있으면 다른 셀렉터 시도
              if (!content) {
                const contentSelectors = ['.u_cbox_contents', '.comment_text'];
                for (const sel of contentSelectors) {
                  const el = element.querySelector(sel);
                  if (el?.textContent?.trim()) {
                    content = el.textContent.trim();
                    break;
                  }
                }
              }

              // 공감수 찾기
              let likes = 0;
              const likeSelectors = [
                '.u_cbox_cnt_recomm',
                '.u_cbox_recomm_count',
                '[class*="recomm"]',
                '[class*="sympathy"]'
              ];

              for (const sel of likeSelectors) {
                const likeEl = element.querySelector(sel);
                if (likeEl) {
                  const likeText = likeEl.textContent?.trim() || '';
                  // "공감"이라는 텍스트가 포함된 경우에만 공감수로 처리
                  if (likeText.includes('공감')) {
                    const match = likeText.match(/(\d+)/);
                    if (match) {
                      likes = parseInt(match[1]);
                      break;
                    }
                  }
                }
              }

              // 공감수가 댓글 내용에 포함된 경우 제거
              if (likes > 0) {
                content = content.replace(/공감\s*\d+|\d+\s*공감/g, '').trim();
              }

              // 메타데이터 텍스트 제거 (신고, 답글 등)
              content = content.replace(/신고\s*답글|답글\s*신고|신고|답글/g, '').trim();

              // 첨부 이미지 URL 찾기
              let imageUrl = '';
              const imageSelectors = [
                '.u_cbox_contents img',
                '.comment_text img',
                '[class*="contents"] img',
                'img[class*="attach"]',
                'img[class*="image"]',
                '.u_cbox_attached img'
              ];

              for (const sel of imageSelectors) {
                const imgEl = element.querySelector(sel);
                if (imgEl) {
                  imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                  if (imageUrl) {
                    // 상대 경로인 경우 절대 경로로 변환
                    if (!imageUrl.startsWith('http')) {
                      imageUrl = `https:${imageUrl.startsWith('//') ? '' : '//'}${imageUrl}`;
                    }
                    break;
                  }
                }
              }

              results.push({
                createdAt,
                commentType,
                nickname,
                authorUrl,
                likes,
                replyCount: 0, // 답글수는 나중에 계산
                imageUrl,
                links: 0,
                content,
              });
            } catch (e) {
              console.error('댓글 파싱 오류:', e);
            }
          });

          return results;
        });

        console.log(`페이지 ${currentPageNumber}: ${comments.length}개 댓글 수집`);
        allComments.push(...comments);

        // 다음 페이지 번호 클릭 (현재 페이지 - 1)
        const nextPageNumber = currentPageNumber - 1;

        if (nextPageNumber < 1) {
          console.log('페이지 1에 도달했습니다. 수집 완료!');
          break;
        }

        console.log(`페이지 번호 ${nextPageNumber} 찾는 중...`);

        // 먼저 페이지 번호를 찾아서 클릭 시도
        const pageClicked = await commentFrame.evaluate((targetPage) => {
          // 페이지네이션에서 숫자 찾기
          const pagination = document.querySelector('.u_cbox_paginate');
          if (!pagination) {
            console.log('페이지네이션을 찾을 수 없습니다');
            return false;
          }

          const allElements = Array.from(pagination.querySelectorAll('a, button, span, div'));

          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            const pageNum = parseInt(text);

            // 정확한 페이지 번호 찾기
            if (pageNum === targetPage) {
              console.log(`페이지 ${targetPage} 버튼 발견`);

              // 클릭 가능한지 확인
              if ((el as HTMLElement).offsetParent !== null) {
                console.log(`페이지 ${targetPage} 클릭 시도...`);
                (el as HTMLElement).click();
                return true;
              }
            }
          }

          console.log(`페이지 ${targetPage} 버튼을 찾을 수 없습니다`);
          return false;
        }, nextPageNumber);

        if (pageClicked) {
          console.log(`✓ 페이지 ${nextPageNumber} 클릭 성공!`);
        } else {
          // 페이지 번호가 안 보이면 "이전" 버튼 클릭
          console.log(`페이지 번호가 보이지 않음. "이전" 버튼 클릭 시도...`);

          const prevClicked = await commentFrame.evaluate(() => {
            const pagination = document.querySelector('.u_cbox_paginate');
            if (!pagination) {
              console.log('페이지네이션을 찾을 수 없습니다');
              return false;
            }

            // 방법 1: title 속성으로 "이전 페이지 목록으로 이동하기" 찾기
            const prevByTitle = pagination.querySelector('[title*="이전 페이지"]');
            if (prevByTitle && (prevByTitle as HTMLElement).offsetParent !== null) {
              console.log(`"이전" 버튼 발견 (title): ${prevByTitle.getAttribute('title')}`);
              (prevByTitle as HTMLElement).click();
              return true;
            }

            // 방법 2: aria-label 속성으로 찾기
            const prevByAria = pagination.querySelector('[aria-label*="이전"]');
            if (prevByAria && (prevByAria as HTMLElement).offsetParent !== null) {
              console.log(`"이전" 버튼 발견 (aria-label): ${prevByAria.getAttribute('aria-label')}`);
              (prevByAria as HTMLElement).click();
              return true;
            }

            // 방법 3: 클래스명으로 "이전" 버튼 찾기
            const prevByClass = pagination.querySelector('.u_cbox_btn_prev, .u_cbox_pre, [class*="prev"], [class*="pre"]');
            if (prevByClass && (prevByClass as HTMLElement).offsetParent !== null) {
              console.log(`"이전" 버튼 발견 (클래스): ${prevByClass.className}`);
              (prevByClass as HTMLElement).click();
              return true;
            }

            // 방법 4: 페이지네이션 내의 모든 요소를 순회하며 찾기
            const allElements = Array.from(pagination.querySelectorAll('a, button'));

            for (const el of allElements) {
              const text = el.textContent?.trim() || '';
              const title = el.getAttribute('title') || '';
              const ariaLabel = el.getAttribute('aria-label') || '';
              const className = el.className || '';

              // title이나 aria-label에 "이전 페이지"가 포함된 경우
              if (title.includes('이전 페이지') || ariaLabel.includes('이전 페이지')) {
                console.log(`"이전" 버튼 발견: title="${title}", aria-label="${ariaLabel}"`);

                if ((el as HTMLElement).offsetParent !== null) {
                  console.log('이전 버튼 클릭 시도...');
                  (el as HTMLElement).click();
                  return true;
                }
              }
            }

            console.log('"이전" 버튼을 찾을 수 없습니다');
            return false;
          });

          if (!prevClicked) {
            console.log('"이전" 버튼도 찾을 수 없습니다. 수집 완료!');
            break;
          }

          console.log('✓ "이전" 버튼 클릭 성공!');

          // "이전" 버튼을 클릭했으므로 페이지 로딩 대기 (좀 더 길게)
          console.log('페이지 로딩 대기 중 (5초)...');
          await new Promise(resolve => setTimeout(resolve, 5000));

          // 현재 페이지 번호 다시 감지
          const newPageInfo = await commentFrame.evaluate(() => {
            const pagination = document.querySelector('.u_cbox_paginate');
            if (!pagination) {
              console.log('페이지네이션을 찾을 수 없습니다');
              return null;
            }

            // 여러 방법으로 현재 페이지 찾기
            // 방법 1: 클래스로 찾기
            let activePageElement = pagination.querySelector('.u_cbox_page_current, .u_cbox_num_page.on, strong');

            // 방법 2: on 클래스를 포함하는 요소 찾기
            if (!activePageElement) {
              const allElements = Array.from(pagination.querySelectorAll('a, span, strong, em'));
              activePageElement = allElements.find(el => {
                const className = el.className || '';
                return className.includes('on') || className.includes('current') || el.tagName === 'STRONG' || el.tagName === 'EM';
              }) || null;
            }

            // 방법 3: 숫자만 있는 요소들 중에서 링크가 아닌 것 찾기
            if (!activePageElement) {
              const allElements = Array.from(pagination.querySelectorAll('span, strong, em'));
              for (const el of allElements) {
                const text = el.textContent?.trim() || '';
                const pageNum = parseInt(text);
                if (!isNaN(pageNum) && pageNum > 0) {
                  console.log(`현재 페이지 후보: ${pageNum} (태그: ${el.tagName})`);
                  activePageElement = el;
                  break;
                }
              }
            }

            if (activePageElement) {
              const pageNum = parseInt(activePageElement.textContent?.trim() || '0');
              console.log(`현재 페이지: ${pageNum} (태그: ${activePageElement.tagName}, 클래스: ${activePageElement.className})`);
              return pageNum;
            }

            console.log('현재 활성화된 페이지를 찾을 수 없습니다');
            return null;
          });

          if (newPageInfo && newPageInfo > 0) {
            currentPageNumber = newPageInfo;
            console.log(`페이지 번호 재감지 성공: ${currentPageNumber}`);
            pageCount++;
            continue; // 다음 루프에서 이 페이지 수집
          } else {
            console.log('페이지 번호를 재감지할 수 없습니다. 수집 완료!');
            break;
          }
        }

        // 페이지 로딩 대기
        console.log('페이지 로딩 대기 중 (3초)...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        currentPageNumber = nextPageNumber;
        pageCount++;

      } catch (e) {
        console.log(`페이지 ${currentPageNumber} 처리 오류:`, e);
        break;
      }
    }

    console.log(`\n=== 전체 수집 완료: 총 ${allComments.length}개 댓글 ===`);

    // 답글수 계산 (각 댓글에 대해 바로 아래 답글의 개수를 세기)
    for (let i = 0; i < allComments.length; i++) {
      const comment = allComments[i];

      // 댓글(답글이 아닌 경우)만 답글 수 계산
      if (comment.commentType === '댓글') {
        let replyCount = 0;

        // 현재 댓글 다음부터 순회하면서 연속된 답글 카운트
        for (let j = i + 1; j < allComments.length; j++) {
          if (allComments[j].commentType === '답글') {
            replyCount++;
          } else {
            // 다음 일반 댓글을 만나면 중단
            break;
          }
        }

        comment.replyCount = replyCount;
      }
    }

    console.log('답글수 계산 완료');

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
