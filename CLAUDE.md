# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 언어 설정
**중요**: Claude는 이 프로젝트에서 모든 답변과 커뮤니케이션을 한국어로 해야 합니다.

## 프로젝트 개요

**기획자와 AI의 협업을 통한 목업 개발**을 위해 설계된 Next.js 14 프로젝트입니다. 하드코딩된 데이터와 최소한의 복잡성으로 빠른 프로토타이핑을 위한 단순하고 직관적인 패턴에 중점을 둡니다.

## 개발 명령어

```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 시작
npm start

# 린팅 실행
npm run lint
```

개발 서버는 http://localhost:3000 에서 실행됩니다.

## 아키텍처 및 핵심 패턴

### 기술 스택
- **Core**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **UI 컴포넌트**: Radix UI 기반 커스텀 컴포넌트 (shadcn/ui 아님)
- **아이콘**: Lucide React
- **폰트**: Pretendard (한국어 타이포그래피)
- **상태관리**: useState (로컬), Zustand (전역 상태 필요시)
- **폼**: React Hook Form + Zod 검증
- **데이터 관리**: 직접 더미데이터 활용 (목업 개발 최적화)
- **알림**: React Toastify
- **날짜 처리**: date-fns
- **스타일링 유틸리티**: clsx, tailwind-merge, class-variance-authority
- **웹 크롤링**: Puppeteer-core (Vercel 배포를 위한 @sparticuz/chromium)

### 레이아웃 구조
- **헤더 전용 레이아웃**: 사이드바 없이 중앙 정렬된 네비게이션을 가진 간단한 헤더
- **전체 높이 페이지**: `min-h-[calc(100vh-65px)]`를 사용하여 적절한 높이 계산
- **헤더 컴포넌트**: `src/components/layout/header.tsx`에 위치

### 컴포넌트 시스템
- **커스텀 UI 컴포넌트**: `src/components/ui/`에 위치
- **Radix UI 기반**: 접근성을 위한 Radix 프리미티브 사용
- **스타일링**: 조건부 클래스를 위한 `cn()` 유틸리티와 Tailwind CSS
- **임포트 패턴**: `import { Button } from '@/components/ui/button'`

### 데이터 및 상태 패턴
- **하드코딩된 데이터**: 즉각적인 시각적 피드백을 위한 더미 데이터 배열 사용
- **로컬 상태**: 컴포넌트 레벨 상태를 위한 useState
- **전역 상태**: 컴포넌트 간 상태 공유가 필요할 때 Zustand 사용
- **복잡한 API 호출 없음**: 목업을 위한 로딩 상태, 에러 처리 지양

### 폴더 구조
```
src/
├── app/                    # Next.js App Router 페이지들
│   ├── blog-comments/     # 네이버 블로그 댓글 수집 페이지
│   └── api/
│       └── blog-comments/ # 댓글 수집 API 라우트
├── components/
│   ├── ui/                # Radix UI 기반 커스텀 컴포넌트
│   └── layout/            # 레이아웃 컴포넌트 (header)
├── lib/                   # 유틸리티 및 핵심 로직
│   ├── utils.ts           # cn 함수 등 유틸리티
│   ├── puppeteer.ts       # Puppeteer 브라우저 관리
│   ├── puppeteer-simple.ts # 댓글 크롤링 로직
│   ├── job-manager.ts     # 백그라운드 작업 관리
│   └── csv-utils.ts       # CSV 변환 유틸리티
├── store/                 # Zustand 스토어 (전역 상태 필요시)
├── types/                 # TypeScript 타입 정의
│   └── blog-comment.ts    # 블로그 댓글 타입
└── hooks/                 # 커스텀 훅
```

## 중요한 가이드라인

### 서브에이전트 활용 (필수)
**중요**: 이 프로젝트에서는 모든 개발 작업을 서브에이전트를 통해 수행해야 합니다. 직접 구현하지 마시고 반드시 아래 서브에이전트를 활용하세요.

#### 사용 가능한 서브에이전트 목록
- **base-ui-component-architect**: UI 컴포넌트, 폼 시스템 및 스타일링 구현
  - 재사용 가능한 Radix UI 기반 컴포넌트 구축
  - React Hook Form + Zod 검증을 포함한 완전한 폼 시스템
  - TypeScript와 Tailwind CSS를 활용한 타입 안전한 구현
  - 시각적 완성도 높은 디자인과 스타일링 적용

- **base-app-router-architect**: Next.js 14 App Router 페이지와 라우팅 구현
  - 새로운 페이지 생성 및 레이아웃 설정
  - API 라우트 구현 및 라우트 그룹 구성
  - 미들웨어 설정 작업

- **basic-auth-architect**: 인증 시스템 구현 (Mock 데이터 활용)
  - NextAuth.js 기반 인증 및 세션 관리
  - 역할 기반 접근 제어
  - Mock 데이터를 활용한 개발 환경 인증 시스템

- **basic-data-integrator**: 데이터 관리 및 상태 관리 시스템 구현
  - 직접 더미데이터 활용으로 즉각적인 결과 확인
  - useState 및 Zustand를 통한 효율적인 상태 관리
  - TypeScript 타입 안전성을 보장하는 데이터 구조 설계

- **base-state-validator**: 상태 관리 코드 검증 및 최적화
  - 상태 관리 패턴의 적절성 평가
  - 성능 이슈 진단 및 리팩터링 전 구조 검증

- **base-code-quality-validator**: 코드 품질 검증 및 프로젝트 규칙 준수
  - 일관성 문제, 성능 문제, 기존 패턴 준수 여부 검토

#### 서브에이전트 활용 원칙
1. **모든 작업은 서브에이전트를 통해 수행**: 복잡성과 관계없이 서브에이전트 활용 필수
2. **적절한 서브에이전트 선택**: 작업 특성에 맞는 전문 서브에이전트 사용
3. **처음부터 끝까지 구현**: 서브에이전트가 전체 기능을 완성도 있게 구현
4. **구현 완료 후 반드시 빌드 검증**: 서브에이전트가 구현을 완료한 후에는 반드시 `npm run build`를 실행하여 빌드 오류가 없는지 확인해야 합니다. `npm run build`로 프로덕션 빌드를 테스트하여 TypeScript 오류, ESLint 오류, 컴파일 오류 등을 사전에 발견하고 해결해야 합니다.


### 사용해야 할 것
- ✅ 즉각적인 결과를 위한 하드코딩된 더미 데이터
- ✅ 간단한 로컬 상태를 위한 useState
- ✅ 전역 상태를 위한 Zustand (꼭 필요한 경우만)
- ✅ `src/components/ui/`의 Radix UI 기반 커스텀 컴포넌트
- ✅ 스타일링을 위한 Tailwind CSS
- ✅ 폼을 위한 React Hook Form + Zod

### 사용하지 말아야 할 것
- ❌ 복잡한 API 호출이나 데이터 페칭
- ❌ Context API (대신 Zustand 사용)
- ❌ shadcn/ui (우리는 커스텀 Radix UI 컴포넌트 사용)
- ❌ 과도한 컴포넌트 엔지니어링
- ❌ 특별히 필요하지 않은 로딩/에러 상태

### 폰트 사용
프로젝트는 Pretendard 폰트를 사용합니다. 폰트 파일은 `public/fonts/`에 있으며 `globals.css`에서 `@font-face`로 로드됩니다.

## 개발 참고사항

### 서브에이전트 우선 개발 방식
- **모든 작업은 서브에이전트 활용**: 직접 구현 대신 적절한 서브에이전트를 선택하여 작업
- **기능별 전문 서브에이전트 활용**: UI는 `base-ui-component-architect`, 페이지는 `base-app-router-architect` 등
- **완성도 높은 구현**: 서브에이전트가 전체 기능을 처음부터 끝까지 완성

---

## 네이버 블로그 댓글 수집 시스템

이 프로젝트는 네이버 블로그 포스팅의 댓글을 수집하여 CSV 파일로 다운로드할 수 있는 시스템을 포함합니다.

### 주요 기능

- **블로그 URL 입력**: 네이버 블로그 포스팅 URL을 입력하여 댓글 수집 시작
- **백그라운드 처리**: 서버 부하를 방지하기 위한 비동기 백그라운드 작업 처리
- **실시간 진행 상황**: 2초마다 폴링하여 수집 진행률 표시
- **CSV 다운로드**: 수집 완료 후 Excel 호환 CSV 파일 다운로드 (UTF-8 BOM)
- **페이지네이션 지원**: 여러 페이지에 걸친 댓글 자동 수집

### 아키텍처

#### 1. 프론트엔드 (src/app/blog-comments/page.tsx)
- URL 입력 폼
- 작업 시작 및 진행 상황 표시
- 실시간 폴링 (2초 간격)
- 수집된 댓글 수 및 진행률 표시
- CSV 다운로드 버튼

#### 2. API 라우트

**POST /api/blog-comments/start**
- 새로운 댓글 수집 작업 생성
- 즉시 jobId 반환
- 백그라운드에서 크롤링 시작

**GET /api/blog-comments/status/[jobId]**
- 작업 진행 상황 조회
- 상태: `pending`, `processing`, `completed`, `failed`
- 진행률 및 수집된 댓글 수 반환
- **중요**: Next.js 14에서 `params`는 Promise일 수 있으므로 `await Promise.resolve(params)` 필요

**GET /api/blog-comments/download/[jobId]**
- 완료된 작업의 CSV 파일 다운로드
- UTF-8 BOM 인코딩으로 Excel 호환
- **중요**: Next.js 14에서 `params`는 Promise일 수 있으므로 `await Promise.resolve(params)` 필요

#### 3. 핵심 라이브러리

**src/lib/puppeteer.ts**
- Puppeteer 브라우저 인스턴스 관리
- Vercel 배포를 위한 @sparticuz/chromium 사용
- 로컬 개발 환경과 프로덕션 환경 자동 감지

**src/lib/puppeteer-simple.ts** (메인 크롤링 로직)
- 네이버 블로그 댓글 수집
- iframe 감지 및 프레임 간 탐색
- "댓글" 버튼 자동 클릭하여 댓글 활성화
- 페이지네이션 지원 ("이전" 버튼 클릭)
- 다중 페이지 순회 (최대 20페이지 제한)

**src/lib/job-manager.ts**
- 인메모리 작업 큐 관리
- 작업 생성, 업데이트, 완료, 실패 처리
- 댓글 추가 및 진행률 추적

**src/lib/csv-utils.ts**
- BlogComment 배열을 CSV 문자열로 변환
- UTF-8 BOM 추가 (Excel 호환)
- 헤더: 작성일, 닉네임, 작성자 URL, 공감수, 링크수, 답글수, 첨부 이미지 URL, 댓글 내용

### 네이버 블로그 댓글 크롤링 방법

#### 크롤링 프로세스

1. **페이지 로드**
   ```typescript
   const url = `https://blog.naver.com/${blogId}/${logNo}`;
   await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
   ```

2. **"댓글" 버튼 찾기 및 클릭**
   - 네이버 블로그는 댓글이 기본적으로 비활성화 상태
   - 포스팅 하단의 "댓글 XXX" 버튼을 클릭해야 댓글이 로드됨
   - 모든 iframe을 순회하며 버튼 탐색
   ```typescript
   const clicked = await frame.evaluate(() => {
     const allElements = Array.from(document.querySelectorAll('button, a, div, span'));
     for (const el of allElements) {
       const text = el.textContent?.trim() || '';
       if (text.includes('댓글') && text.length < 20) {
         if ((el as HTMLElement).offsetParent !== null) {
           (el as HTMLElement).click();
           return true;
         }
       }
     }
     return false;
   });
   ```

3. **댓글 컨테이너 및 요소 탐색**
   - 댓글 컨테이너: `#cbox_module`, `.u_cbox`
   - 개별 댓글 요소: `.u_cbox_comment_box`
   - 닉네임: `.u_cbox_nick`
   - 날짜: `.u_cbox_date`
   - 내용: `.u_cbox_contents`

4. **페이지네이션 처리**
   - 네이버 블로그는 마지막 페이지부터 표시 (역순)
   - "이전" 버튼을 클릭하여 이전 페이지로 이동
   - 버튼이 없을 때까지 반복
   ```typescript
   while (currentPage <= maxPages) {
     // 현재 페이지 댓글 수집
     const pageComments = await collectCommentsFromCurrentPage();
     allComments.push(...pageComments);

     // "이전" 버튼 클릭
     const prevButtonClicked = await clickPreviousButton();
     if (!prevButtonClicked) break;

     // 페이지 로딩 대기
     await new Promise(resolve => setTimeout(resolve, 3000));
     currentPage++;
   }
   ```

5. **CSV 생성 및 다운로드**
   - 모든 댓글 수집 완료 후 CSV 변환
   - UTF-8 BOM 추가하여 Excel에서 한글 깨짐 방지
   - `Content-Disposition: attachment` 헤더로 다운로드 처리

### 주의사항

#### Next.js 14 App Router Params 처리
```typescript
// ❌ 잘못된 방법
export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const { jobId } = params; // 오류 발생 가능
}

// ✅ 올바른 방법
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const { jobId } = resolvedParams;
}
```

#### Puppeteer Vercel 배포
- `puppeteer-core` 사용 (전체 Puppeteer는 Vercel 용량 제한 초과)
- `@sparticuz/chromium` 패키지로 헤드리스 Chrome 제공
- 환경 변수로 로컬/프로덕션 구분:
  ```typescript
  const isDev = process.env.NODE_ENV === 'development';
  const executablePath = isDev
    ? '/usr/bin/google-chrome' // 로컬 Chrome 경로
    : await chromium.executablePath(); // Vercel용 Chromium
  ```

#### 크롤링 안정성
- **User Agent 설정**: 봇 차단 방지
- **적절한 대기 시간**: 페이지/댓글 로딩 후 2-5초 대기
- **프레임 순회**: 모든 iframe 확인하여 댓글 찾기
- **무한 루프 방지**: 최대 페이지 수 제한 (20페이지)
- **오류 처리**: 각 프레임/페이지 처리 중 오류 발생 시 다음으로 계속

### CSV 출력 형식

```csv
작성일,닉네임,작성자 URL,공감수,링크수,답글수,첨부 이미지 URL,댓글 내용
2024.01.15. 14:30,홍길동,https://blog.naver.com/user123,5,0,2,,정말 유익한 글이네요!
2024.01.15. 13:20,김철수,https://blog.naver.com/user456,2,1,0,https://example.com/image.jpg,사진 정보 감사합니다
```

### 페이지 접근

- **URL**: http://localhost:3000/blog-comments
- **입력 형식**:
  - `https://blog.naver.com/[blogId]/[logNo]`
  - `https://m.blog.naver.com/[blogId]/[logNo]`
  - `blog.naver.com/[blogId]/[logNo]` (자동으로 https 추가)

### 향후 개선 가능 사항

1. **추가 데이터 수집**: 작성자 URL, 공감수, 답글수, 첨부 이미지 등
2. **작업 지속성**: 인메모리 대신 데이터베이스 사용
3. **동시 작업 제한**: 서버 리소스 보호를 위한 큐 시스템
4. **재시도 로직**: 네트워크 오류 시 자동 재시도
5. **작업 취소**: 진행 중인 작업 중단 기능
6. **다중 URL 일괄 처리**: 여러 포스팅 한 번에 수집