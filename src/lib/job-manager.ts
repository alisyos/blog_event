import { BlogComment } from '@/types/blog-comment';
import * as fs from 'fs';
import * as path from 'path';

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

// 파일 시스템 기반 저장소 (Vercel /tmp 디렉토리)
const JOBS_DIR = path.join('/tmp', 'jobs');

// /tmp/jobs 디렉토리 생성
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

// 작업 자동 정리 (1시간 후)
const JOB_CLEANUP_TIME = 60 * 60 * 1000; // 1시간

/**
 * 작업 파일 경로 가져오기
 */
function getJobFilePath(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

/**
 * 작업 저장
 */
function saveJob(job: Job): void {
  const filePath = getJobFilePath(job.id);
  fs.writeFileSync(filePath, JSON.stringify(job), 'utf8');
}

/**
 * 작업 로드
 */
function loadJob(id: string): Job | undefined {
  const filePath = getJobFilePath(id);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const job = JSON.parse(data);
    // Date 객체 복원
    job.createdAt = new Date(job.createdAt);
    job.updatedAt = new Date(job.updatedAt);
    return job;
  } catch (error) {
    console.error(`작업 ${id} 로드 실패:`, error);
    return undefined;
  }
}

/**
 * 작업 삭제
 */
function deleteJob(id: string): void {
  const filePath = getJobFilePath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

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

  saveJob(job);

  // 자동 정리 스케줄 (서버리스 환경에서는 동작하지 않을 수 있음)
  setTimeout(() => {
    deleteJob(id);
    console.log(`작업 ${id} 자동 삭제됨`);
  }, JOB_CLEANUP_TIME);

  return job;
}

/**
 * 작업 조회
 */
export function getJob(id: string): Job | undefined {
  return loadJob(id);
}

/**
 * 작업 상태 업데이트
 */
export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const job = loadJob(id);
  if (!job) return undefined;

  Object.assign(job, updates, { updatedAt: new Date() });
  saveJob(job);

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
  const job = loadJob(id);
  if (!job) return undefined;

  job.comments.push(...newComments);
  job.collectedComments = job.comments.length;
  job.updatedAt = new Date();

  saveJob(job);
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
  try {
    const files = fs.readdirSync(JOBS_DIR);
    const jobs: Job[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const jobId = file.replace('.json', '');
        const job = loadJob(jobId);
        if (job) jobs.push(job);
      }
    }

    return jobs;
  } catch (error) {
    console.error('모든 작업 조회 실패:', error);
    return [];
  }
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
  try {
    const allJobs = getAllJobs();
    if (allJobs.length <= maxJobs) return;

    const sortedJobs = allJobs.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const toDelete = sortedJobs.slice(0, allJobs.length - maxJobs);
    toDelete.forEach((job) => {
      deleteJob(job.id);
      console.log(`작업 ${job.id} 정리됨 (최대 개수 초과)`);
    });
  } catch (error) {
    console.error('작업 정리 실패:', error);
  }
}
