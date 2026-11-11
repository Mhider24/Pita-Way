import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props<T> {
  id?: string
  items: { label: string; value: T }[]
  value: T
  onChange: (value: T) => void
}

/** shadcn Select for a plain list of options. */
export function FormSelect<T extends string | number>({ id, items, value, onChange }: Props<T>) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v !== null && onChange(v as T)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const options = <T extends string>(values: readonly T[]) => values.map((v) => ({ label: v, value: v }))
