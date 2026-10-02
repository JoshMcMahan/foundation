import { SortDownIcon, SortUnsortedIcon, SortUpIcon } from '../icons'
import { useStrings } from './Provider'

export type TDirection = 'ascending' | 'descending' | 'unsorted'

const SortIcon = ({
  currentlySorted,
  currentDirection,
  name,
}: {
  currentlySorted: string | null
  currentDirection: TDirection
  name: string
}) => {
  const style = { transform: 'translateY(2px)' }

  if (currentlySorted === name) {
    if (currentDirection === 'ascending') {
      return <SortDownIcon style={style} />
    } else if (currentDirection === 'descending') {
      return <SortUpIcon style={style} />
    }
  } else {
    return <SortUnsortedIcon style={style} />
  }
  return null
}

function Sort<T extends string>({
  currentlySorted,
  name,
  setCurrentDirection,
  setCurrentlySorted,
  currentDirection,
}: {
  currentlySorted: T | null
  name: NoInfer<T>
  setCurrentDirection: (direction: TDirection) => void
  setCurrentlySorted: (value: NoInfer<T> | '') => void
  currentDirection: TDirection
}) {
  const t = useStrings().common
  const sort = (sorted: T | null, direction: TDirection) => {
    if (sorted === name) {
      if (direction === 'ascending') {
        setCurrentDirection('descending')
      } else if (direction === 'descending') {
        setCurrentDirection('unsorted')
        setCurrentlySorted('')
      }
    } else {
      setCurrentDirection('ascending')
      setCurrentlySorted(name)
    }
  }

  return (
    <div className="inline">
      <button
        type="button"
        aria-label={t.sort}
        onClick={() => sort(currentlySorted, currentDirection)}
      >
        <SortIcon
          currentDirection={currentDirection}
          currentlySorted={currentlySorted}
          name={name}
        />
      </button>
    </div>
  )
}

export default Sort
