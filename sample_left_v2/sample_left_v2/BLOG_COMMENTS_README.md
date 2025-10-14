# 네이버 블로그 댓글 수집 기능

## 개요
네이버 블로그 포스팅의 댓글을 자동으로 수집하고 CSV 파일로 다운로드할 수 있는 웹 페이지입니다.

## 접속 경로
```
http://localhost:3000/blog-comments
```

## 주요 기능

### 1. 댓글 수집
- 네이버 블로그 URL 입력 및 검증
- 실시간 댓글 데이터 크롤링
- 진행 상태 표시 (로딩 인디케이터)
- 수집 완료 알림

### 2. 데이터 미리보기
- 수집된 댓글을 테이블 형식으로 표시
- 다음 정보 포함:
  - 작성일
  - 닉네임 (작성자 블로그 링크 포함)
  - 공감수
  - 링크수 (댓글 내 URL 개수)
  - 답글수
  - 댓글 내용
  - 첨부 이미지 (있는 경우)

### 3. CSV 다운로드
- UTF-8 BOM 인코딩 (엑셀에서 한글 깨짐 방지)
- 타임스탬프가 포함된 파일명 자동 생성
- 원클릭 다운로드

## 사용 방법

### 1. 블로그 URL 입력
다음 형식 중 하나로 입력:
```
blog.naver.com/아이디/게시글번호
https://blog.naver.com/아이디/게시글번호
```

예시:
```
blog.naver.com/ok_hira/224017202538
```

### 2. 댓글 수집 시작
- "댓글 수집" 버튼 클릭
- 로딩 인디케이터가 표시되며 수집 진행
- 수집 완료 시 토스트 알림 표시

### 3. 결과 확인
- 수집된 댓글이 테이블 형식으로 표시
- 각 댓글의 상세 정보 확인 가능

### 4. CSV 다운로드
- "CSV 다운로드" 버튼 클릭
- 파일명: `naver-blog-comments-YYYYMMDD.csv`

## 구현된 파일 목록

### 1. 타입 정의
**파일**: `/src/types/blog-comment.ts`
```typescript
- BlogComment: 댓글 데이터 타입
- BlogCommentsResponse: API 응답 타입
- BlogCommentRequest: API 요청 타입
```

### 2. CSV 유틸리티
**파일**: `/src/lib/csv-utils.ts`
```typescript
- convertCommentsToCSV(): 댓글을 CSV 형식으로 변환
- downloadCSV(): CSV 파일 다운로드
```

### 3. API 라우트
**파일**: `/src/app/api/blog-comments/route.ts`
- POST 메서드: 블로그 URL을 받아 댓글 데이터 반환
- 네이버 댓글 API 호출 및 데이터 파싱
- 에러 처리 및 검증

### 4. 프론트엔드 페이지
**파일**: `/src/app/blog-comments/page.tsx`
- React Hook Form + Zod를 이용한 폼 검증
- 댓글 수집 및 표시
- CSV 다운로드 기능
- React Toastify를 통한 알림

## 기술 스택

### Frontend
- Next.js 14 (App Router)
- React Hook Form + Zod (폼 검증)
- React Toastify (알림)
- Tailwind CSS (스타일링)
- Lucide React (아이콘)

### Backend
- Next.js API Routes
- 네이버 댓글 API 연동

### UI 컴포넌트
- Radix UI 기반 커스텀 컴포넌트
  - Button
  - Input
  - Table
  - Label

## API 명세

### POST /api/blog-comments

**요청**:
```json
{
  "blogUrl": "blog.naver.com/아이디/게시글번호"
}
```

**응답 (성공)**:
```json
{
  "success": true,
  "comments": [
    {
      "createdAt": "2024.03.15. 14:30",
      "nickname": "사용자",
      "authorUrl": "https://blog.naver.com/사용자",
      "likes": 5,
      "links": 1,
      "replyCount": 2,
      "imageUrl": "https://...",
      "content": "댓글 내용"
    }
  ],
  "total": 10,
  "blogUrl": "blog.naver.com/ok_hira/224017202538"
}
```

**응답 (실패)**:
```json
{
  "success": false,
  "comments": [],
  "total": 0,
  "blogUrl": "blog.naver.com/ok_hira/224017202538",
  "error": "에러 메시지"
}
```

## CSV 출력 형식

```csv
작성일,닉네임,작성자 URL,공감수,링크수,답글수,첨부 이미지 URL,댓글 내용
"2024.03.15. 14:30","사용자","https://blog.naver.com/사용자","5","1","2","https://...","댓글 내용입니다"
```

## 주의사항

### 1. Vercel 배포
- 서버리스 함수 타임아웃: 최대 10초 (Hobby 플랜)
- 댓글이 많은 경우 타임아웃 발생 가능
- 페이지네이션 구현 권장 (현재는 최대 100개까지 수집)

### 2. 네이버 API 제한
- 네이버 댓글 API는 공식 API가 아니므로 변경될 수 있음
- rate limiting이 적용될 수 있음
- 프로덕션 환경에서는 캐싱 전략 권장

### 3. CORS
- Next.js API Routes를 통해 우회하므로 CORS 문제 없음

## 개발 서버 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev

# 브라우저에서 접속
http://localhost:3000/blog-comments
```

## 프로덕션 빌드

```bash
# 빌드
npm run build

# 프로덕션 서버 시작
npm start
```

## 검증 완료 사항

- ✅ TypeScript 타입 검증 통과
- ✅ ESLint 검증 통과
- ✅ 모든 필수 파일 생성 완료
- ✅ React Hook Form + Zod 검증 구현
- ✅ 에러 처리 및 알림 구현
- ✅ CSV UTF-8 BOM 인코딩 적용
- ✅ 반응형 UI 구현

## 향후 개선 사항

1. **페이지네이션**: 댓글이 많은 경우 여러 페이지로 나누어 수집
2. **캐싱**: 같은 URL에 대한 중복 요청 방지
3. **진행률 표시**: 실시간 수집 진행률 표시
4. **답글 수집**: 답글도 함께 수집하는 옵션
5. **필터링**: 특정 기간, 작성자 등으로 필터링
6. **정렬 옵션**: 날짜, 공감수 등으로 정렬
7. **에러 복구**: 네트워크 오류 시 재시도 로직
