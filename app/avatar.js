import { memberAvatar } from '@/lib/style';

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export default function Avatar({ name, size = 'md', className = '' }) {
  const { initials, bg, text } = memberAvatar(name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${bg} ${text} ${SIZES[size]} ${className}`}
    >
      {initials}
    </span>
  );
}
