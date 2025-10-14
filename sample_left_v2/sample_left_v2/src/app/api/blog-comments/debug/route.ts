import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/job-manager';

/**
 * GET /api/blog-comments/debug
 * 디버그용: 현재 저장된 모든 작업 조회
 */
export async function GET() {
  const jobs = getAllJobs();

  return NextResponse.json({
    success: true,
    totalJobs: jobs.length,
    jobs: jobs.map(job => ({
      id: job.id,
      blogUrl: job.blogUrl,
      status: job.status,
      progress: job.progress,
      totalComments: job.totalComments,
      collectedComments: job.collectedComments,
      hasCSV: !!job.csvData,
      csvSize: job.csvData ? job.csvData.length : 0,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }))
  });
}

export const dynamic = 'force-dynamic';
