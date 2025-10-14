import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

let browserInstance: Browser | null = null;

/**
 * Puppeteer 브라우저 인스턴스 가져오기 (싱글톤)
 */
export async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    return browserInstance;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Vercel 프로덕션 환경
    browserInstance = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    // 로컬 개발 환경
    // Chrome 또는 Chromium 경로 자동 감지
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

    let executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;

    if (!executablePath) {
      for (const path of possiblePaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    browserInstance = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }

  return browserInstance;
}

/**
 * 브라우저 종료
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 네이버 블로그 댓글 크롤링
 */
export async function scrapeNaverBlogComments(blogId: string, logNo: string) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // User Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 블로그 포스트 페이지 접속
    const url = `https://blog.naver.com/${blogId}/${logNo}`;
    console.log('크롤링 시작:', url);

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // iframe으로 전환
    const frames = page.frames();
    const mainFrame = frames.find(
      (frame) =>
        frame.url().includes('PostView.naver') ||
        frame.url().includes('PostView.nhn')
    );

    if (!mainFrame) {
      throw new Error('메인 프레임을 찾을 수 없습니다');
    }

    console.log('메인 프레임 발견:', mainFrame.url());

    // 댓글 영역이 로드될 때까지 대기
    console.log('댓글 로딩 대기 중...');

    // 스크롤하여 모든 댓글 로드
    await mainFrame.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 댓글 더보기 버튼 클릭 시도
    try {
      await mainFrame.evaluate(() => {
        const moreButtons = Array.from(document.querySelectorAll('a, button, span')).filter(el => {
          const text = el.textContent?.trim() || '';
          return text.includes('더보기') || text.includes('more') || text.includes('댓글');
        });

        moreButtons.forEach((btn: any) => {
          if (btn.click) {
            btn.click();
          }
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('더보기 버튼 클릭 시도 실패');
    }

    // 페이지 HTML 구조 확인 (디버깅)
    const pageContent = await mainFrame.content();
    console.log('페이지에 "댓글" 텍스트 포함 여부:', pageContent.includes('댓글'));

    // 댓글 iframe이 있는지 확인
    const commentFrames = page.frames().filter(f =>
      f.url().includes('CommentBox') ||
      f.url().includes('comment') ||
      f.url().includes('cbox')
    );

    if (commentFrames.length > 0) {
      console.log(`댓글 전용 iframe 발견: ${commentFrames.length}개`);
      commentFrames.forEach(cf => console.log('댓글 iframe URL:', cf.url()));
    }

    // 댓글 데이터 추출
    const comments = await mainFrame.evaluate(() => {
      const results: any[] = [];

      // 댓글 영역만 정확히 찾기
      const commentContainers = [
        '#cbox_module',
        '.u_cbox',
        '.u_cbox_content_wrap',
        '#comment',
        '#commentModule',
        '[class*="u_cbox"]',
      ];

      let commentArea: Element | null = null;

      // 댓글 컨테이너 찾기
      for (const selector of commentContainers) {
        const area = document.querySelector(selector);
        if (area) {
          console.log(`댓글 컨테이너 발견: ${selector}`);
          commentArea = area;
          break;
        }
      }

      // 댓글 컨테이너 내부에서만 댓글 항목 찾기
      const selectors = [
        '.u_cbox_comment_box',
        '.u_cbox_list',
        '.u_cbox_list > li',
        '[class*="u_cbox_list"]',
        '.CommentItem',
        '.comment_item',
        '.comment-item',
        '[class*="CommentItem"]',
        '[class*="comment_item"]',
      ];

      let commentElements: NodeListOf<Element> | null = null;

      // 댓글 컨테이너 내부에서만 검색
      if (commentArea) {
        for (const selector of selectors) {
          const elements = commentArea.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`댓글 영역 내에서 셀렉터 "${selector}"로 ${elements.length}개 요소 발견`);
            commentElements = elements;
            break;
          }
        }
      } else {
        // 컨테이너를 못 찾은 경우 전체 문서에서 검색
        console.log('댓글 컨테이너를 찾지 못함, 전체 문서 검색');
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`셀렉터 "${selector}"로 ${elements.length}개 요소 발견`);
            commentElements = elements;
            break;
          }
        }
      }

      // 댓글 요소를 찾지 못한 경우 전체 HTML 분석
      if (!commentElements || commentElements.length === 0) {
        console.log('기본 셀렉터로 찾지 못함. 전체 HTML 분석 시작...');

        // class나 id에 "comment"가 포함된 모든 요소 찾기
        const allElements = document.querySelectorAll('*');
        const possibleComments: Element[] = [];

        allElements.forEach(el => {
          const className = el.className?.toString().toLowerCase() || '';
          const id = el.id?.toLowerCase() || '';

          if (className.includes('comment') || id.includes('comment')) {
            possibleComments.push(el);
          }
        });

        console.log('comment 관련 요소:', possibleComments.length);

        if (possibleComments.length > 0) {
          // 첫 5개 요소의 클래스명 로깅
          possibleComments.slice(0, 5).forEach((el, i) => {
            console.log(`요소 ${i + 1}:`, el.className, el.tagName);
          });
        }
      }

      // 실제 댓글 데이터 추출
      if (commentElements && commentElements.length > 0) {
        commentElements.forEach((element, index) => {
          try {
            // 모든 텍스트 노드 추출
            const allText = element.textContent?.trim() || '';

            if (!allText || allText.length < 2) {
              return;
            }

            // 닉네임 찾기 (다양한 패턴)
            let nickname = '';
            const nicknameSelectors = [
              '.comment_nickname', '.nickname', '.nick', '.name',
              '[class*="nickname"]', '[class*="nick"]', '[class*="name"]'
            ];
            for (const sel of nicknameSelectors) {
              const el = element.querySelector(sel);
              if (el?.textContent?.trim()) {
                nickname = el.textContent.trim();
                break;
              }
            }

            // 날짜 찾기
            let createdAt = '';
            const dateSelectors = [
              '.comment_time', '.date', '.time',
              '[class*="date"]', '[class*="time"]'
            ];
            for (const sel of dateSelectors) {
              const el = element.querySelector(sel);
              if (el?.textContent?.trim()) {
                createdAt = el.textContent.trim();
                break;
              }
            }

            // 댓글 내용 찾기
            let content = '';
            const contentSelectors = [
              '.comment_text', '.text_comment', '.comment_content', '.content',
              '[class*="comment_text"]', '[class*="text"]', '[class*="content"]'
            ];
            for (const sel of contentSelectors) {
              const el = element.querySelector(sel);
              if (el?.textContent?.trim()) {
                content = el.textContent.trim();
                break;
              }
            }

            // 내용을 못 찾은 경우 전체 텍스트 사용
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
            console.error(`댓글 ${index} 파싱 오류:`, e);
          }
        });
      }

      return results;
    });

    console.log(`${comments.length}개의 댓글 수집 완료`);

    return comments;
  } catch (error) {
    console.error('크롤링 오류:', error);
    throw error;
  } finally {
    await page.close();
  }
}
