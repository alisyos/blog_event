export default function InstagramCommentsPage() {
  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center">
      <div className="text-center max-w-2xl px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            인스타그램 댓글 수집
          </h1>
          <div className="inline-block bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg">
            <span className="font-semibold">개발 예정</span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-8 border border-gray-200">
          <p className="text-lg text-gray-700 mb-4">
            이 기능은 현재 개발 중입니다.
          </p>
          <p className="text-gray-600">
            곧 인스타그램 게시물의 댓글을 수집하여 CSV 파일로 다운로드할 수 있는 기능이 추가될 예정입니다.
          </p>
        </div>

        <div className="mt-8 text-sm text-gray-500">
          <p>기대해 주세요!</p>
        </div>
      </div>
    </div>
  )
}
