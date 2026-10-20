/** Подсказки поля из общего справочника: <Input list={id} /> предлагает значения, но можно ввести и своё. */
export function DictList({ id, items }: { id: string; items: string[] }) {
  return (
    <datalist id={id}>
      {items.map((x) => (
        <option key={x} value={x} />
      ))}
    </datalist>
  );
}
