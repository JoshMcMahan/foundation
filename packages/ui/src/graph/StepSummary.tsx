import { Loader } from '../components/Loader'
import Markdown from '../components/Markdown'
import { useRunFile, useStrings } from '../components/Provider'

// A summary is written once, when its step ends, so it is fetched without polling.
export function StepSummary({ runSlug, path }: { runSlug: string; path: string }) {
  const { dag } = useStrings()
  const { data, isLoading, error } = useRunFile(runSlug, path)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-7">
      {isLoading && data === undefined ? (
        <div className="flex h-full items-center justify-center">
          <Loader label={dag.loadingSummary} size={70} />
        </div>
      ) : error || data === undefined ? (
        <p className="text-xs theme-muted-text">{dag.summaryLoadFailed}</p>
      ) : (
        // A summary is prose and tables; past a reading measure its lines get hard to follow.
        <div className="max-w-[72ch]">
          <Markdown httpsImagesOnly compact>
            {data}
          </Markdown>
        </div>
      )}
    </div>
  )
}
