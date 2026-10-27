import { createContext } from 'react'

/** Inside a `DescriptionListGroup`, which lays its lists out on one pair of columns. A list
 *  and a `Section` between the group and its lists pass those columns through, so the lists
 *  keep sharing one label column. */
export const InDescriptionListGroup = createContext(false)
