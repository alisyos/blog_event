// 네이버 블로그 댓글 타입 정의

export interface BlogComment {
  createdAt: string;      // 작성일
  commentType: string;    // 구분 (댓글/답글)
  nickname: string;       // 닉네임
  authorUrl: string;      // 작성자 URL
  likes: number;          // 공감수
  links: number;          // 링크수
  replyCount: number;     // 답글수
  imageUrl: string;       // 첨부 이미지 URL
  content: string;        // 댓글 내용
}

export interface BlogCommentsResponse {
  success: boolean;
  comments: BlogComment[];
  total: number;
  blogUrl: string;
  error?: string;
}

export interface BlogCommentRequest {
  blogUrl: string;
}
