import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

interface UserAvatarProps {
  /**
   * Profile image URL. The API exposes no avatar field today, so this is
   * normally undefined and the icon fallback renders instead.
   */
  src?: string;
  /**
   * Alt text for the image. Defaults to empty: the avatar is decorative when
   * the control wrapping it already carries the user's name.
   */
  alt?: string;
  className?: string;
}

/**
 * A user's avatar, falling back to a neutral icon when no image is available.
 *
 * Colors come from the `muted` / `muted-foreground` tokens, which are redefined
 * under `.dark` in index.css, so light and dark are handled without any
 * theme-conditional logic here.
 */
export function UserAvatar({ src, alt = "", className }: UserAvatarProps) {
  return (
    <Avatar className={cn("size-6 rounded-md", className)}>
      {src ? <AvatarImage src={src} alt={alt} /> : null}
      <AvatarFallback className="rounded-md">
        <UserRound className="size-3.5" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
