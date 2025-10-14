export default function Home() {
  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">댓글 수집 도구</h1>
        <p className="text-lg text-gray-600 mb-4">좌측 메뉴에서 원하는 기능을 선택하세요</p>
        <div className="space-y-2 text-gray-500">
          <p>• 네이버 블로그 댓글 수집</p>
          <p>• 인스타그램 댓글 수집 (개발 예정)</p>
        </div>
      </div>
    </div>
  )
}