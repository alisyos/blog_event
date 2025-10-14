import { BlogComment } from '@/types/blog-comment';

/**
 * 댓글 데이터를 CSV 형식으로 변환
 * @param comments 댓글 데이터 배열
 * @returns CSV 문자열 (UTF-8 BOM 포함)
 */
export function convertCommentsToCSV(comments: BlogComment[]): string {
  // CSV 헤더
  const headers = [
    '작성일',
    '구분',
    '닉네임',
    '작성자 URL',
    '공감수',
    '링크수',
    '답글수',
    '첨부 이미지 URL',
    '댓글 내용'
  ];

  // CSV 행 생성
  const rows = comments.map(comment => [
    comment.createdAt,
    comment.commentType,
    comment.nickname,
    comment.authorUrl,
    comment.likes.toString(),
    comment.links.toString(),
    comment.replyCount.toString(),
    comment.imageUrl,
    comment.content.replace(/"/g, '""') // 따옴표 이스케이프
  ]);

  // CSV 문자열 생성
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => `"${cell}"`).join(',')
    )
  ].join('\n');

  // UTF-8 BOM 추가 (엑셀에서 한글 깨짐 방지)
  return '\uFEFF' + csvContent;
}

/**
 * CSV 파일 다운로드
 * @param comments 댓글 데이터 배열
 * @param filename 파일명 (기본값: naver-blog-comments.csv)
 */
export function downloadCSV(comments: BlogComment[], filename: string = 'naver-blog-comments.csv'): void {
  const csv = convertCommentsToCSV(comments);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
