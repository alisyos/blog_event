import { BlogComment } from '@/types/blog-comment';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  blogUrl: string;
  status: JobStatus;
  progress: number; // 0-100
  totalComments: number;
  collectedComments: number;
  currentPage?: number; // 현재 수집 중인 페이지 번호
  totalPages?: number; // 전체 페이지 수
  comments: BlogComment[];
  csvData?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 인메모리 작업 저장소 (HMR 보호)
// Next.js 개발 모드에서 HMR이 발생해도 데이터가 유지되도록 globalThis 사용
declare global {
  var __jobs: Map<string, Job> | undefined;
}

const jobs = globalThis.__jobs ?? new Map<string, Job>();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__jobs = jobs;
}

// 작업 자동 정리 (1시간 후)
const JOB_CLEANUP_TIME = 60 * 60 * 1000; // 1시간

/**
 * 새로운 작업 생성
 */
export function createJob(blogUrl: string): Job {
  const id = generateJobId();
  const job: Job = {
    id,
    blogUrl,
    status: 'pending',
    progress: 0,
    totalComments: 0,
    collectedComments: 0,
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobs.set(id, job);

  // 자동 정리 스케줄
  setTimeout(() => {
    jobs.delete(id);
    console.log(`작업 ${id} 자동 삭제됨`);
  }, JOB_CLEANUP_TIME);

  return job;
}

/**
 * 작업 조회
 */
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/**
 * 작업 상태 업데이트
 */
export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  Object.assign(job, updates, { updatedAt: new Date() });
  jobs.set(id, job);

  return job;
}

/**
 * 작업 진행률 업데이트
 */
export function updateJobProgress(
  id: string,
  progress: number,
  collectedComments: number,
  totalComments?: number
): Job | undefined {
  const updates: Partial<Job> = {
    progress: Math.min(100, Math.max(0, progress)),
    collectedComments,
  };

  if (totalComments !== undefined) {
    updates.totalComments = totalComments;
  }

  return updateJob(id, updates);
}

/**
 * 댓글 추가
 */
export function addComments(id: string, newComments: BlogComment[]): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  job.comments.push(...newComments);
  job.collectedComments = job.comments.length;
  job.updatedAt = new Date();

  jobs.set(id, job);
  return job;
}

/**
 * 작업 완료 처리
 */
export function completeJob(id: string, csvData: string): Job | undefined {
  return updateJob(id, {
    status: 'completed',
    progress: 100,
    csvData,
  });
}

/**
 * 작업 실패 처리
 */
export function failJob(id: string, error: string): Job | undefined {
  return updateJob(id, {
    status: 'failed',
    error,
  });
}

/**
 * 모든 작업 조회 (디버깅용)
 */
export function getAllJobs(): Job[] {
  return Array.from(jobs.values());
}

/**
 * 작업 ID 생성
 */
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 작업 정리 (최대 개수 제한)
 */
export function cleanupOldJobs(maxJobs: number = 100): void {
  if (jobs.size <= maxJobs) return;

  const sortedJobs = Array.from(jobs.entries())
    .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());

  const toDelete = sortedJobs.slice(0, jobs.size - maxJobs);
  toDelete.forEach(([id]) => {
    jobs.delete(id);
    console.log(`작업 ${id} 정리됨 (최대 개수 초과)`);
  });
}
