# 배포 가이드

## 네이버 블로그 댓글 수집 웹페이지 배포

### Vercel 배포 방법

#### 1. Vercel CLI 설치
```bash
npm i -g vercel
```

#### 2. 프로젝트 빌드 테스트
```bash
npm run build
```

#### 3. Vercel에 배포
```bash
vercel
```

처음 배포 시 다음 질문들에 답변:
- Set up and deploy? `Y`
- Which scope? (본인 계정 선택)
- Link to existing project? `N`
- Project name? (원하는 이름 입력)
- In which directory is your code located? `./`
- Override settings? `N`

#### 4. 프로덕션 배포
```bash
vercel --prod
```

### 주의사항

#### Puppeteer 및 Chromium
- **로컬 개발**: Chrome 브라우저가 설치되어 있어야 합니다
- **Vercel 배포**: `@sparticuz/chromium` 패키지가 자동으로 Chromium을 제공합니다

#### 서버리스 함수 제한
- **무료 플랜**: 최대 10초 타임아웃
- **Pro 플랜**: 최대 60초 타임아웃 (현재 설정)
- **메모리**: 1024MB 할당됨

댓글이 많은 게시글의 경우 시간이 오래 걸릴 수 있으므로 Pro 플랜 권장

#### 환경 변수 (선택사항)
Vercel 대시보드에서 환경 변수 설정 가능:
- `CHROME_PATH`: Chrome 실행 파일 경로 (로컬 개발용)

### 로컬 개발 환경 설정

#### Chrome 브라우저 설치
Windows:
- Google Chrome 다운로드: https://www.google.com/chrome/
- 기본 경로에 설치하면 자동으로 감지됩니다

macOS:
```bash
brew install --cask google-chrome
```

Linux:
```bash
sudo apt-get install google-chrome-stable
# 또는
sudo yum install google-chrome-stable
```

#### 개발 서버 실행
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000/blog-comments` 접속

### 문제 해결

#### "Chrome 실행 파일을 찾을 수 없습니다" 오류
`.env.local` 파일 생성 후 Chrome 경로 지정:
```
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

#### "타임아웃" 오류
- 댓글이 많은 경우 시간이 오래 걸립니다
- Vercel Pro 플랜으로 업그레이드하여 타임아웃 시간 증가

#### 배포 후 작동하지 않음
- Vercel 로그 확인: `vercel logs`
- 환경 변수가 올바르게 설정되었는지 확인
- `@sparticuz/chromium` 패키지가 설치되었는지 확인

### 성능 최적화

#### 캐싱
현재 설정은 캐시를 사용하지 않습니다 (`Cache-Control: no-store`)
필요한 경우 API 라우트에서 캐시 헤더를 수정하세요

#### 브라우저 재사용
Puppeteer 브라우저 인스턴스가 싱글톤으로 관리되어 성능이 향상됩니다

### 비용 안내

#### Vercel 요금제
- **Hobby (무료)**:
  - 서버리스 함수 실행 시간 100GB-Hrs/월
  - 10초 타임아웃
  - 취미 프로젝트에 적합

- **Pro ($20/월)**:
  - 서버리스 함수 실행 시간 1000GB-Hrs/월
  - 60초 타임아웃
  - 상용 서비스에 권장

더 자세한 정보: https://vercel.com/pricing

### 법적 고지

네이버 블로그 댓글 수집은 개인 용도 및 이벤트 관리 목적으로만 사용하세요.
무단 수집, 재배포, 상업적 이용은 관련 법규에 위배될 수 있습니다.
