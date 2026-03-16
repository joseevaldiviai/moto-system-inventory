import { forwardRef } from 'react'
import DatePicker from 'react-datepicker'

const formatDate = (date) => {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const parseDate = (value) => {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const CustomInput = forwardRef(function CustomInput({ value, onClick, placeholder, inputStyle }, ref) {
  return (
    <input
      ref={ref}
      onClick={onClick}
      value={value || ''}
      placeholder={placeholder}
      style={inputStyle}
      readOnly
    />
  )
})

export default function DatePickerInput({ value, onChange, placeholder, inputStyle }) {
  return (
    <DatePicker
      selected={parseDate(value)}
      onChange={(date) => onChange(formatDate(date))}
      dateFormat="yyyy-MM-dd"
      placeholderText={placeholder}
      popperPlacement="bottom-start"
      customInput={<CustomInput inputStyle={inputStyle} placeholder={placeholder} />}
      isClearable
    />
  )
}
