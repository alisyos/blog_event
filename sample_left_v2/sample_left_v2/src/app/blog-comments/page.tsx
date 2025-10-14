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

  // 댓글 수집 시작
  const onSubmit = async (data: BlogUrlFormData) => {
    try {
      const response = await fetch('/api/blog-comments/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blogUrl: data.blogUrl }),
      });

      const result = await response.json();

      if (result.success && result.jobId) {
        setJobInfo({
          id: result.jobId,
          status: 'pending',
          progress: 0,
          totalComments: 0,
          collectedComments: 0,
        });
      } else {
        alert(result.error || '작업 시작에 실패했습니다.');
      }
    } catch (error) {
      console.error('작업 시작 오류:', error);
      alert('작업 시작 중 오류가 발생했습니다.');
    }
  };

  // CSV 다운로드
  const handleDownloadCSV = () => {
    if (!jobInfo?.id || jobInfo.status !== 'completed') {
      alert('다운로드할 댓글이 없습니다.');
      return;
    }

    window.location.href = `/api/blog-comments/download/${jobInfo.id}`;
  };

  // 새로운 수집 시작
  const handleNewCollection = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    setJobInfo(null);
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
            <li>댓글 수집은 백그라운드에서 진행되며, 수집 중에도 다른 작업을 할 수 있습니다</li>
            <li>댓글이 많은 경우 수집에 수 분이 소요될 수 있습니다</li>
            <li>네이버 서버 부하를 방지하기 위해 적절한 대기 시간이 적용됩니다</li>
            <li>수집된 댓글은 CSV 파일로 다운로드할 수 있습니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
