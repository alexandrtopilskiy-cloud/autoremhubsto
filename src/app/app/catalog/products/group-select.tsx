import { Select } from "@/components/ui";

export function GroupSelect({ groups, value, disabled }: { groups: { id: string; name: string }[]; value?: string | null; disabled?: boolean }) {
  return (
    <Select name="groupId" defaultValue={value ?? ""} aria-label="Группа" className="w-48" disabled={disabled}>
      <option value="">Без группы</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}
