export type IconName = string;

export function Icon({ name, class: className = "icon" }: { name: IconName; class?: string }) {
  return (
    <svg class={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
