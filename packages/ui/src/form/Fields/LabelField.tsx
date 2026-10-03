import cx from 'classnames'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'

export interface ILabelField extends BaseField {
  type: 'label'
  text?: string
  size?: number
  bold?: boolean
}

export default function LabelField(props: FieldComponentProps<ILabelField>) {
  const { field, label } = props

  return (
    <div className="flex items-center w-full">
      <h3
        style={{ whiteSpace: 'pre-wrap', ...(field.size ? { fontSize: `${field.size}px` } : {}) }}
        className={cx('relative', 'text-md', field.bold !== false ? 'font-bold' : '')}
      >
        {field.text?.toString().replace(/(\r)/g, '').replace(/(\\n)/g, '\n') || label}
      </h3>
    </div>
  )
}
