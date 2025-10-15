'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Download, CheckCircle2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Zod 스키마 정의
const blogUrlSchema = z.object({
  blogUrl: z
    .string()
    .min(1, '블로그 URL을 입력해주세요')
    .refine(
      (url) => {
        const normalized = url.includes('://') ? url : `https://${url}`;
        try {
          const urlObj = new URL(normalized);
          return (
            urlObj.hostname === 'blog.naver.com' ||
            urlObj.hostname === 'm.blog.naver.com'
          );
        } catch {
          return false;
        }
      },
      {
        message: '올바른 네이버 블로그 URL을 입력해주세요 (예: blog.naver.com/아이디/게시글번호)',
      }
    ),
});

type BlogUrlFormData = z.infer<typeof blogUrlSchema>;

type JobStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

interface JobInfo {
  id: string;
  status: JobStatus;
  progress: number;
  totalComments: number;
  collectedComments: number;
  currentPage?: number;
  totalPages?: number;
  error?: string;
}

export default function BlogCommentsPage() {
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [collectedComments, setCollectedComments] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<BlogUrlFormData>({
    resolver: zodResolver(blogUrlSchema),
  });

  // 작업 상태 폴링
  useEffect(() => {
    if (jobInfo?.id && (jobInfo.status === 'pending' || jobInfo.status === 'processing')) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/blog-comments/status/${jobInfo.id}`);
          const data = await response.json();

          if (data.success && data.job) {
            setJobInfo({
              id: data.job.id,
              status: data.job.status,
              progress: data.job.progress,
              totalComments: data.job.totalComments,
              collectedComments: data.job.collectedComments,
              currentPage: data.job.currentPage,
              totalPages: data.job.totalPages,
              error: data.job.error,
            });

            // 완료 또는 실패 시 폴링 중지
            if (data.job.status === 'completed') {
              clearInterval(interval);
            } else if (data.job.status === 'failed') {
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error('상태 조회 오류:', error);
        }
      }, 2000); // 2초마다 상태 확인

      setPollingInterval(interval);

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [jobInfo?.id, jobInfo?.status]);

  // 댓글 수집 시작 (스트리밍 방식)
  const onSubmit = async (data: BlogUrlFormData) => {
    try {
      // 초기화
      setCollectedComments([]);

      // 로딩 상태 표시
      setJobInfo({
        id: 'streaming',
        status: 'processing',
        progress: 0,
        totalComments: 0,
        collectedComments: 0,
      });

      const response = await fetch('/api/blog-comments/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blogUrl: data.blogUrl }),
      });

      if (!response.ok) {
        throw new Error('서버 응답 오류');
      }

      if (!response.body) {
        throw new Error('응답 본문 없음');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 스트림 읽기
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // 마지막 불완전한 라인은 buffer에 남김
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line);

            if (chunk.type === 'start') {
              console.log('수집 시작:', chunk.message);
            } else if (chunk.type === 'page') {
              // 페이지별 업데이트 및 댓글 저장
              setCollectedComments(prev => [...prev, ...chunk.comments]);
              setJobInfo(prev => ({
                id: prev?.id || 'streaming',
                status: 'processing',
                progress: chunk.progress,
                totalComments: chunk.totalComments,
                collectedComments: chunk.totalComments,
                totalPages: chunk.totalPages,
                currentPage: chunk.page,
              }));
            } else if (chunk.type === 'complete') {
              // 완료
              setJobInfo(prev => ({
                id: prev?.id || 'streaming',
                status: 'completed',
                progress: 100,
                totalComments: chunk.total,
                collectedComments: chunk.total,
              }));
            } else if (chunk.type === 'error') {
              // 오류
              setJobInfo(prev => ({
                id: prev?.id || 'error',
                status: 'failed',
                progress: prev?.progress || 0,
                totalComments: prev?.totalComments || 0,
                collectedComments: prev?.collectedComments || 0,
                error: chunk.error,
              }));
            }
          } catch (parseError) {
            console.error('JSON 파싱 오류:', parseError, 'Line:', line);
          }
        }
      }

    } catch (error) {
      console.error('스트리밍 수집 오류:', error);
      setJobInfo({
        id: 'error',
        status: 'failed',
        progress: 0,
        totalComments: 0,
        collectedComments: 0,
        error: '댓글 수집 중 오류가 발생했습니다.',
      });
    }
  };

  // CSV 다운로드
  const handleDownloadCSV = () => {
    if (!jobInfo || jobInfo.status !== 'completed' || collectedComments.length === 0) {
      alert('다운로드할 댓글이 없습니다.');
      return;
    }

    // CSV 생성
    const headers = ['작성일시', '댓글/답글', '닉네임', '작성자URL', '공감수', '답글수', '이미지URL', '링크수', '내용'];
    const csvRows = [
      headers.join(','),
      ...collectedComments.map(comment => [
        comment.createdAt || '',
        comment.commentType || '',
        comment.nickname || '',
        comment.authorUrl || '',
        comment.likes || 0,
        comment.replyCount || 0,
        comment.imageUrl || '',
        comment.links || 0,
        `"${(comment.content || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"` // Escape quotes and remove newlines
      ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `naver_blog_comments_${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 새로운 수집 시작
  const handleNewCollection = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    setJobInfo(null);
    setCollectedComments([]);
    reset();
  };

  return (
    <div className="min-h-[calc(100vh-65px)] p-8 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            네이버 블로그 댓글 수집
          </h1>
          <p className="text-slate-600">
            네이버 블로그 게시글의 댓글을 수집하고 CSV로 다운로드하세요.
          </p>
        </div>

        {/* 수집 진행 모달 */}
        {jobInfo && (jobInfo.status === 'pending' || jobInfo.status === 'processing') && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  댓글 수집 중...
                </h3>
                <p className="text-slate-600 mb-6">
                  잠시만 기다려주세요
                </p>

                {/* 진행률 표시 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      {jobInfo.collectedComments}개 수집됨
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {jobInfo.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${jobInfo.progress}%` }}
                    />
                  </div>
                </div>

                {/* 페이지 정보 */}
                {jobInfo.currentPage && jobInfo.totalPages && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-900 font-medium">
                      페이지 {jobInfo.currentPage} / {jobInfo.totalPages} 수집 중
                    </p>
                    <p className="text-blue-700 text-sm mt-1">
                      예상 댓글 수: 약 {jobInfo.totalComments}개
                    </p>
                  </div>
                )}

                {!jobInfo.currentPage && (
                  <p className="text-sm text-slate-500">
                    페이지 정보를 확인하고 있습니다...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 입력 폼 */}
        {!jobInfo && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="blogUrl" className="text-sm font-medium">
                  블로그 URL
                </Label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      id="blogUrl"
                      type="text"
                      placeholder="blog.naver.com/아이디/게시글번호"
                      {...register('blogUrl')}
                      className="w-full"
                    />
                    {errors.blogUrl && (
                      <p className="text-sm text-red-500 mt-1">
                        {errors.blogUrl.message}
                      </p>
                    )}
                  </div>
                  <Button type="submit" className="min-w-[120px]">
                    댓글 수집 시작
                  </Button>
                </div>
              </div>

              <div className="text-sm text-slate-500">
                <p className="font-medium mb-1">사용 예시:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>blog.naver.com/ok_hira/224017202538</li>
                  <li>https://blog.naver.com/ok_hira/224017202538</li>
                </ul>
              </div>
            </form>
          </div>
        )}

        {/* 진행 상태 */}
        {jobInfo && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="space-y-4">
              {/* 상태 헤더 */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">
                  {jobInfo.status === 'pending' && '작업 대기 중...'}
                  {jobInfo.status === 'processing' && '댓글 수집 중...'}
                  {jobInfo.status === 'completed' && '수집 완료!'}
                  {jobInfo.status === 'failed' && '수집 실패'}
                </h2>

                <div className="flex items-center gap-2">
                  {jobInfo.status === 'processing' && (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  )}
                  {jobInfo.status === 'completed' && (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  {jobInfo.status === 'failed' && (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </div>

              {/* 진행률 바 */}
              {(jobInfo.status === 'pending' || jobInfo.status === 'processing') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      {jobInfo.collectedComments}개 / {jobInfo.totalComments > 0 ? `약 ${jobInfo.totalComments}개` : '확인 중'}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {jobInfo.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${jobInfo.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    댓글을 수집하고 있습니다. 잠시만 기다려주세요...
                  </p>
                </div>
              )}

              {/* 완료 메시지 */}
              {jobInfo.status === 'completed' && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-800 font-medium">
                      총 {jobInfo.collectedComments}개의 댓글을 성공적으로 수집했습니다!
                    </p>
                    <p className="text-green-700 text-sm mt-1">
                      아래 버튼을 클릭하여 CSV 파일을 다운로드하세요.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleDownloadCSV}
                      className="flex-1"
                      size="lg"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      CSV 다운로드
                    </Button>
                    <Button
                      onClick={handleNewCollection}
                      variant="outline"
                      size="lg"
                    >
                      새로운 수집
                    </Button>
                  </div>
                </div>
              )}

              {/* 실패 메시지 */}
              {jobInfo.status === 'failed' && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 font-medium">댓글 수집에 실패했습니다</p>
                    <p className="text-red-700 text-sm mt-1">
                      {jobInfo.error || '알 수 없는 오류가 발생했습니다.'}
                    </p>
                  </div>

                  <Button
                    onClick={handleNewCollection}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    다시 시도
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 안내 사항 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">안내 사항</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>스트리밍 방식으로 실시간 댓글 수집이 진행됩니다</li>
            <li>페이지별로 데이터를 전송하므로 타임아웃 없이 모든 댓글을 수집할 수 있습니다</li>
            <li>네이버 서버 부하를 방지하기 위해 적절한 대기 시간이 적용됩니다</li>
            <li>수집된 댓글은 CSV 파일로 다운로드할 수 있습니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
