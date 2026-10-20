import type { JSX, SVGProps } from "react";
import {
  BriefcaseIcon,
  ChatBubbleIcon,
  ClockIcon,
  CoffeeIcon,
  ExitIcon,
  ForkKnifeIcon,
  HeartIcon,
  HouseIcon,
  ShoppingBagIcon,
  UserIcon,
  UsersIcon,
  WaveIcon,
  XIcon,
} from "@/components/icons";
import type { NoticeIconName } from "@/content/notice";

const ICONS: Record<NoticeIconName, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  wave: WaveIcon,
  heart: HeartIcon,
  coffee: CoffeeIcon,
  "fork-knife": ForkKnifeIcon,
  "shopping-bag": ShoppingBagIcon,
  briefcase: BriefcaseIcon,
  house: HouseIcon,
  users: UsersIcon,
  "chat-bubble": ChatBubbleIcon,
  user: UserIcon,
  exit: ExitIcon,
  x: XIcon,
  clock: ClockIcon,
};

/** Maps a content-level icon name to its line icon (inherits currentColor). */
export function NoticeIcon({ name, ...props }: { name: NoticeIconName } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}
