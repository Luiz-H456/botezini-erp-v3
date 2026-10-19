import { stringToColor, initials } from '@/utils/finance';

interface PartyAvatarProps {
    name: string;
    size?: number;
}

export function PartyAvatar({ name, size = 28 }: PartyAvatarProps) {
    return (
        <div
            style={{ width: size, height: size, backgroundColor: stringToColor(name), fontSize: size * 0.38 }}
            className="rounded-full flex items-center justify-center font-black text-white shrink-0 select-none"
        >
            {initials(name)}
        </div>
    );
}
